import pyvista as pv

def diff(o1, o2, scheme=0, alpha=0.25, title="diff3d", **kwargs):

    window_size = (1500, 1500)

    # for interoperability with other vtk-based libraries
    # TODO: add more?
    def convert(o):
        if "vedo" in str(type(o)):
            o = o.dataset
        return o

    # accept lists and tuples of objects
    if isinstance(o1, (list,tuple)):
        o1 = pv.MultiBlock([convert(o) for o in o1])
    if isinstance(o2, (list,tuple)):
        o2 = pv.MultiBlock([convert(o) for o in o2])

    # configure plotter
    if isinstance(title, (list,tuple)):
        title = f"green: {title[0]}   |   red: {title[1]}"
    pl = pv.Plotter(window_size = window_size, title = title)
    pl.enable_terrain_style(mouse_wheel_zooms=True, shift_pans=True)

    # colorblind-friendly schemes (per https://davidmathlogic.com/colorblind)
    schemes = [
        (0, 250, 0), # green/red(dish) https://davidmathlogic.com/colorblind/#%2300FA00-%23FA00FA
        (0, 100, 250), # blue/orange https://davidmathlogic.com/colorblind/#%23FA9600-%230064FA
        (100, 75, 250), # purple/yellow https://davidmathlogic.com/colorblind/#%23E1FA4B-%23644BFA
    ]
    
    # complementary colors
    c1 = schemes[scheme]
    c2 = tuple(250 + min(c1) - c for c in c1)

    # completely opaque doesn't work
    alpha = min(alpha, 0.99)

    pl.add_mesh(convert(o1), color=c1, opacity=alpha, **kwargs)
    pl.add_mesh(convert(o2), color=c2, opacity=alpha, **kwargs)

    pl.show()

def load(path):
    if path.endswith(".step") or path.endswith(".stp"):
        import build123d
        step = build123d.importers.import_step(path)
        points, faces = step.tessellate(tolerance=0.1)
        points = [tuple(p) for p in points]
        print(f"{len(points)} points, {len(faces)} faces")
        return pv.PolyData.from_regular_faces(points, faces)
    else:
        return pv.read(path)

def from_files(path1, path2, title=None):
    if title is None:
        title = (path1, path2)
    o1 = load(path1)
    o2 = load(path2)
    diff(o1, o2, title=title)

if __name__ == "__main__":
    import sys
    pv.global_theme.line_width = 3
    pv.global_theme.point_size = 8
    pv.global_theme.window_size = (1500, 1500)
    from_files(sys.argv[1], sys.argv[2])

