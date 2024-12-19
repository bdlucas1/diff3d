import math
import numpy as np
import scipy

viz = None
dbg = False


# for each point find and return the closest point on the mesh to that point
# returned points are not necessarily mesh vertex points
def find_closest(mesh, points):
    _, closest = mesh.find_closest_cell(points, return_closest_point=True)    
    return closest


# place approximately n sample points on the mesh
# this will give roughly equal weight to all parts of the mesh by area
# using the mesh vertex points might wildly over-weight areas of high detail
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


# align two meshes by moving one
# returns the delta that can be used to translate moving to align it with stationary
def align(stationary, moving, callback=None, n=2000, width_pcts=None, tol_rel=1e-5):

    # default value
    width_pcts = (np.inf, 8, 2, 0.5) if width_pcts is None else width_pcts

    # place approximately n sample points on the moving_points mesh
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
        if dbg: print(f"minimize pass, size {size:.1f}, tol_rel {tol_rel:.1g}, width_pct {width_pct:.2f}")
        if width_pct == np.inf:
            fun = lambda x: sum(sqdists(x))
        else:
            sqwidth = (size * width_pct / 100) ** 2
            fun = lambda x: -sum(np.exp(-sqdists(x) / sqwidth))
        result = scipy.optimize.minimize(fun, x0=delta0.tolist(), method="L-BFGS-B", tol=tol_rel*size)
        nonlocal nfev
        nfev += result.nfev
        return result.x

    # initial guess: align centroids
    delta = np.average(stationary.points, axis=0) - np.average(moving.points, axis=0)

    # multiple minimization passes at different widths
    nfev = 0
    for width_pct in width_pcts:
        delta = minimize(delta, width_pct)
    if dbg: print(f"nfev: {nfev}")

    # caller can translate moving by delta to align
    return delta

