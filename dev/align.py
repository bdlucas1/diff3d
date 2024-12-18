import math
import numpy as np
import scipy

# for each point find and return the closest point on the mesh to that point
# returned points are not necessarily mesh vertex points
def find_closest(mesh, points):
    _, closest = mesh.find_closest_cell(points, return_closest_point=True)    
    return closest

# place approximately n sample points on the mesh
# this will give roughly equal weight to all parts of the mesh by area
# using the mesh vertex points may wildly over-weight areas of high detail
def sample_points(mesh, n):

    # compute a cell size based on area of mesh such that
    # we get approximately n sample points on mesh
    def area(face):
        p1, p2, p3 = mesh.points[list(face)]
        return np.linalg.norm(np.cross(p2-p1, p3-p1)) / 2
    area = sum(area(face) for face in mesh.regular_faces)
    cell_size = np.sqrt(area / n)
    print(f"cell size {cell_size}")

    # construct a 3d grid with points spaced cell_size apart
    xmin, xmax, ymin, ymax, zmin, zmax = mesh.bounds
    xs = np.arange(xmin, xmax+cell_size, cell_size)
    ys = np.arange(ymin, ymax+cell_size, cell_size)
    zs = np.arange(zmin, zmax+cell_size, cell_size)
    grid = np.array([(x,y,z) for x in xs for y in ys for z in zs])
    print(f"{len(grid)} grid points")
    #viz.show(mesh, grid)

    # find the closest point on the mesh to each grid
    closest = find_closest(mesh, grid)

    # filter the closest points to include only those near the grid point it came from
    # check duplicates - there shouldn't be any (or very few) 
    points = [p for p, g in zip(closest, grid) if np.max(np.abs(p-g)) <= cell_size/2]
    print(f"{len(points)} close points; {len(set(tuple(p) for p in points))} without duplicates")
    #viz.show(mesh, points)

    return points, cell_size

def align(stationary, moving, n=5000):

    # place approximately n sample points on the moving_points mesh
    moving_points, cell_size = sample_points(moving)
    print(f"{len(moving_points)} sample points")

    # compute distance squared for each point in moving points
    # if we were to move moving_points by delta
    def sqdists(delta):

        points = moving_points + delta
        closest = find_closest(stationary, points)
        deltas = closest - points
        sqdists = np.array([np.dot(d, d) for d in deltas])

        #viz.show(stationary, closest)
        print(x)

        return sqdists

    # minimize total penalty for a given initial delta, tolerance, and penalty function
    # penalty is a function of the array of squared distances, e.g.
    #     sum of squared distances
    #     negative sum of exp of negative squared distances (i.e. gaussian)
    # "L-BFGS-B" minimization method had by far fewer goal function executions
    # which is important here because they are expensive
    def minimize(delta, tol, penalty):
        print(f"start {delta}, tol {tol}")
        fun = lambda x: penalty(sqdists(x))
        result = scipy.optimize.minimize(fun, x0=delta.tolist(), method="L-BFGS-B", tol=tol)
        return result.x
    
    # initial guess is to align centroids
    delta = np.average(stationary.points, axis=0) - np.average(moving.points, axis=0)

    # minimize penalty using sum of squared distances
    delta = minimize(delta, 1e-2, penalty = lambda sqdists: sum(sqdists))

    # now minimize further using a sharper penalty function that ignores points that aren't close
    delta = minimize(delta, 1e-5, penalty = lambda sqdists: -sum(np.exp(-sqdists/cell_size**2))) # TODO: scale?

    # move it and return
    return moving.translate(delta)

if __name__ == "__main__":

    import viz
    import lib

    # TODO: generate and test some more examples
    stationary = lib.load("../examples/lens-clamp-A.obj").scale((1000, 1000, 1000))
    moving = lib.load("../examples/lens-clamp-B.obj").scale((1000, 1000, 1000))

    moving = moving.translate(100,100,100)
    #viz.show_diff(stationary, moving)

    moving = align(stationary, moving)
    viz.show_diff(stationary, moving)
