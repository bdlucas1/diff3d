# load files and display a window showing the diff
def from_files(path1, path2, scheme="1", title=None, align=False, width_pcts=None):

    import pyvista

    pyvista.global_theme.color = (0.70, 0.80, 1.0)
    pyvista.global_theme.line_width = 3
    pyvista.global_theme.point_size = 8
    pyvista.global_theme.window_size = (1500, 1500)

    if title is None:
        title = (path1, path2) if path2 else path1
    o1 = load(path1)
    o2 = load(path2) if path2 else None
    diff(o1, o2, scheme=scheme, title=title, align=align, width_pcts=width_pcts)


# display a window showing the diff between to pyvista objects
def diff(o1, o2, scheme="1", alpha=0.25, title="diff3d", align=False, width_pcts=None, **kwargs):

    import pyvista

    # for interoperability with other vtk-based libraries
    # TODO: add more?
    def convert(o):
        if "vedo" in str(type(o)):
            o = o.dataset
        return o

    # accept lists and tuples of objects
    if isinstance(o1, (list,tuple)):
        o1 = pyvista.MultiBlock([convert(o) for o in o1])
    if isinstance(o2, (list,tuple)):
        o2 = pyvista.MultiBlock([convert(o) for o in o2])

    # align if requested
    if align and o2 is not None:
        print("aligning...", end="", flush=True)
        dot = lambda _: print(".", end="", flush=True)
        delta = align3d(o1, o2, dot, width_pcts=width_pcts)
        print()
        o2 = o2.translate(delta)

    # get color scheme information
    name1, name2, color1 = color_schemes[scheme]

    # configure plotter
    if isinstance(title, (list,tuple)):
        title = f"{name1}: {title[0]}   |   {name2}: {title[1]}"
    pl = pyvista.Plotter(title = title)
    pl.enable_terrain_style(mouse_wheel_zooms=True, shift_pans=True)

    # complementary colors
    color2 = tuple(250 + min(color1) - c for c in color1)

    # completely opaque doesn't work
    alpha = min(alpha, 0.99)

    if o2:
        pl.add_mesh(convert(o1), color=color1, opacity=alpha, **kwargs)
        pl.add_mesh(convert(o2), color=color2, opacity=alpha, **kwargs)
    else:
        pl.add_mesh(o1)

    pl.show()


# load a file from a given path and return a pyvista object
def load(path):

    import pyvista

    if path.endswith(".step") or path.endswith(".stp"):
        try:
            import build123d
        except ModuleNotFoundError:
            print("For STEP file support please install build123d")
            exit()
        step = build123d.importers.import_step(path)
        points, faces = step.tessellate(tolerance=0.1)
        points = [tuple(p) for p in points]
        print(f"{len(points)} points, {len(faces)} faces")
        return pyvista.PolyData.from_regular_faces(points, faces)
    elif path.endswith(".3mf"):
        import lib3mf
        wrapper = lib3mf.Wrapper()
        model = wrapper.CreateModel()
        model.QueryReader("3mf").ReadFromFile(path)
        blocks = pyvista.MultiBlock()
        items = model.GetBuildItems()
        while items.MoveNext():
            item = items.GetCurrent()
            res = item.GetObjectResource()
            vertices = res.GetVertices()
            triangles = res.GetTriangleIndices()
            points = [v.Coordinates for v in vertices]
            faces = [t.Indices for t in triangles]
            blocks.append(pyvista.PolyData.from_regular_faces(points, faces))
        merged = pyvista.merge(blocks)
        return merged
    else:
        return pyvista.read(path)


# colorblind-friendly color schemes per https://davidmathlogic.com/colorblind
color_schemes = {
    "1": ("green", "red", (0, 250, 0)),
    "2": ("blue", "orange", (0, 100, 250)),
    "3": ("purple", "yellow", (100, 75, 250)),
}


viz = None
dbg = False

# align two meshes by moving one
# returns the delta that can be used to translate moving to align it with stationary
def align3d(stationary, moving, callback=None, n=2000, width_pcts=None, tol_rel=1e-5):

    import numpy as np
    import scipy

    # default value
    width_pcts = (np.inf, 8, 2, 0.5) if width_pcts is None else width_pcts

    # for each point find and return the closest point on a mesh to that point
    # returned points are not necessarily mesh vertex points
    def find_closest(mesh, points):
        _, closest = mesh.find_closest_cell(points, return_closest_point=True)    
        return closest

    # place approximately n sample points on amesh
    def sample_points(mesh, n):

        # compute a cell size based on area of mesh such that
        # we get approximately n sample points on mesh
        def area(face):
            p1, p2, p3 = mesh.points[list(face)]
            return np.linalg.norm(np.cross(p2-p1, p3-p1)) / 2
        total_area = sum(area(face) for face in mesh.regular_faces)
        cell_size = np.sqrt(total_area / n)
        if dbg: print(f"cell size {cell_size}")

        # construct a 3d grid with points spaced cell_size apart
        xmin, xmax, ymin, ymax, zmin, zmax = mesh.bounds
        xs = np.arange(xmin, xmax+cell_size, cell_size)
        ys = np.arange(ymin, ymax+cell_size, cell_size)
        zs = np.arange(zmin, zmax+cell_size, cell_size)
        grid = np.array([(x,y,z) for x in xs for y in ys for z in zs])
        if dbg: print(f"{len(grid)} grid points")
        if viz: viz.show("mesh with 3d grid", mesh, grid)

        # find the closest point on the mesh to each grid point
        closest = find_closest(mesh, grid)

        # filter the closest points to include only those near the grid point it came from
        # sanity check: there should be no (or very few) duplicates
        points = [p for p, g in zip(closest, grid) if np.max(np.abs(p-g)) <= cell_size/2]
        if dbg: print(f"{len(points)} close points; {len(set(tuple(p) for p in points))} without duplicates")
        if viz: viz.show("sample points", points) #viz.show(mesh.alpha(0.2), points)

        return points, cell_size

    # place approximately n sample points on the moving_points mesh
    # this will give roughly equal weight to all parts of the mesh by area
    # using the mesh vertex points might wildly over-weight areas of high detail
    moving_points, cell_size = sample_points(moving, n)
    if dbg: print(f"{len(moving_points)} sample points")

    # compute distance squared for each point in moving points
    # if we were to move moving_points by delta
    def sqdists(delta):

        points = moving_points + delta
        closest = find_closest(stationary, points)
        deltas = closest - points
        sqdists = np.array([np.dot(d, d) for d in deltas])

        if callback: callback(delta)
        #if viz: viz.show(stationary, closest)
        if dbg: print(f"delta: [{delta[0]:.3f} {delta[1]:.3f} {delta[2]:.3f}]")

        return sqdists

    # minimize total penalty for a given initial delta, tolerance, and width_pct
    # width_pct is width of gaussian penalty function in percent of object size
    # width_pct of inf means least squares
    # "L-BFGS-B" minimization method had by far fewer goal function executions,
    # which is important here because they are expensive
    xmin, xmax, ymin, ymax, zmin, zmax = stationary.bounds
    size = np.sqrt((xmax-xmin)**2 + (ymax-ymin)**2 + (zmax-zmin)**2)
    def minimize(delta0, width_pct):
        from scipy.optimize import minimize
        if dbg: print(f"minimize pass, size {size:.1f}, tol_rel {tol_rel:.1g}, width_pct {width_pct:.2f}")
        if width_pct == np.inf:
            fun = lambda x: sum(sqdists(x))
        else:
            sqwidth = (size * width_pct / 100) ** 2
            fun = lambda x: -sum(np.exp(-sqdists(x) / sqwidth))
        result = minimize(fun, x0=delta0.tolist(), method="L-BFGS-B", tol=tol_rel*size)
        nonlocal nfev
        nfev += result.nfev
        return result.x

    # initial guess: align centroids
    delta = np.average(stationary.points, axis=0) - np.average(moving.points, axis=0)

    # do multiple minimization passes at different widths
    nfev = 0
    for width_pct in width_pcts:
        delta = minimize(delta, width_pct)
    if dbg: print(f"nfev: {nfev}")

    # caller can translate moving by delta to align
    return delta


def cli():

    import argparse

    parser = argparse.ArgumentParser(
        prog = "diff3d",
        description = "Visual diff for 3d files",
    )
    
    parser.add_argument("file1")
    parser.add_argument("file2", nargs="?")
    parser.add_argument("--align", "-a", action="store_true", help="Align models")
    parser.add_argument(
        "--scheme", "-s",
        choices = color_schemes.keys(),
        default = "1",
        help = "Color scheme",
    )
    parser.add_argument("--widths", nargs="*", type=float)
    args = parser.parse_args()

    from_files(args.file1, args.file2, scheme=args.scheme, align=args.align, width_pcts=args.widths)

if __name__ == "__main__":
    cli()
    
