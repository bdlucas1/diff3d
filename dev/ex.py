import lib
import viz
import pyvista as pv
import numpy as np

def joint():

    def make_shape(r1, r2, l, inward=0):
        shape = pv.Sphere(r1)
        c = pv.Circle(r2)
        for d in (1,0,0), (0,1,0), (0,0,1):

            d = lib.norm(np.array(d) * (1-inward) + np.array([1,1,1]) * inward)

            x = lib.xform_from_to((0,0,1), d)
            cx = lib.apply_xform(x, c)

            pipe = cx.extrude(np.array(d) * l, capping=True)
            pipe = lib.orient(pipe.triangulate()) #.compute_normals(auto_orient_normals=True)
            shape = lib.union(shape, pipe)

        x = lib.xform_from_to((1,1,1), (0,0,-1))
        shape = lib.apply_xform(x, shape)

        return shape


    shape1 = make_shape(r1=100, r2=80, l=125, inward=-0.2)
    shape2 = make_shape(r1=100, r2=80, l=125, inward=0.2)
    shape2 = shape2.translate((0, 100, 100))

    #viz.show_diff(shape1, shape2)

    import align
    #align.viz = viz
    shape2 = align.align(shape1, shape2, width_pct=10)

    viz.show_diff(shape1, shape2)


joint()    
