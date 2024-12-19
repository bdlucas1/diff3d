import lib
import viz
import pyvista as pv
import numpy as np

def make_test_files():

    def make_shape(r1, r2, l, inward=0):

        # start with a sphere
        shape = pv.Sphere(r1)

        # add three pipes
        for d in (1,0,0), (0,1,0), (0,0,1):

            # move directon of pipe towards middle
            d = lib.norm(np.array(d) * (1-inward) + np.array([1,1,1]) * inward)

            # transform a circle to point along d
            c = pv.Circle(r2)
            x = lib.xform_from_to((0,0,1), d)
            cx = lib.apply_xform(x, c)

            # extrude transformed circle to make pipe and add to shape
            pipe = cx.extrude(np.array(d) * l, capping=True)
            pipe = lib.orient(pipe.triangulate())
            shape = lib.union(shape, pipe)

        x = lib.xform_from_to((1,1,1), (0,0,-1))
        shape = lib.apply_xform(x, shape)

        return shape

    def thick():
        a = make_shape(r1=100, r2=80, l=125, inward=-0.2)
        b = make_shape(r1=100, r2=80, l=125, inward=0.2)
        c = b.translate((0,100,100))
        lib.save(a, "../examples/sphere+thick-A.obj")
        lib.save(b, "../examples/sphere+thick-B.obj")
        lib.save(c, "../examples/sphere+thick-C.obj")

    def thin():
        a = make_shape(r1=100, r2=40, l=175, inward=-0.2)
        b = make_shape(r1=100, r2=40, l=175, inward=0.2)
        c = b.translate((0,100,100))
        lib.save(a, "../examples/sphere+thin-A.obj")
        lib.save(b, "../examples/sphere+thin-B.obj")
        lib.save(c, "../examples/sphere+thin-C.obj")

    def long():
        a = make_shape(r1=100, r2=40, l=250, inward=-0.2)
        b = make_shape(r1=100, r2=40, l=250, inward=0.2)
        c = b.translate((0,100,100))
        lib.save(a, "../examples/sphere+long-A.obj")
        lib.save(b, "../examples/sphere+long-B.obj")
        lib.save(c, "../examples/sphere+long-C.obj")

    thick()
    thin()
    long()
    

def test(a, b, width_pcts):

    import align

    a = lib.load(f"../examples/{a}")
    b = lib.load(f"../examples/{b}")

    xmin, xmax, ymin, ymax, zmin, zmax = a.bounds
    size = np.sqrt((xmax-xmin)**2 + (ymax-ymin)**2 + (zmax-zmin)**2)

    delta = lib.timeit("align", lambda: align.align(a, b, width_pcts=width_pcts))
    
    rel_error = np.linalg.norm(delta) / size
    print(f"relative error {rel_error:.4f}")
    if rel_error > 0.0005:
        msg = f"FAIL: relative error {rel_error:.4f}"
        viz.show_diff(a, b.translate(delta), title=msg)
        raise Exception(msg)

if __name__ == "__main__":

    ###make_test_files(); exit()

    #wp = (np.inf, 15, 5, 1.5, 0.5) # align: 3.356 s  align: 5.604 s
    #wp = (np.inf, 2, 0.5) # align: 2.965 s align: 6.180 s
    #wp = (np.inf, 8, 4, 1) # FAIL 0.0009

    # best so far
    wp = (np.inf, 8, 2, 0.5) # align: 3.177 s align: 5.213 s

    # long is iffy: some combos work, some don't
    #test("sphere+long-A.obj", "sphere+long-B.obj", wp)
    #test("sphere+long-B.obj", "sphere+long-A.obj", wp)

    test("sphere+thin-A.obj", "sphere+thin-B.obj", wp)
    test("sphere+thin-B.obj", "sphere+thin-A.obj", wp)
    test("sphere+thick-A.obj", "sphere+thick-B.obj", wp)
    test("sphere+thick-B.obj", "sphere+thick-A.obj", wp)

    test("sphere+thin-A.obj", "sphere+thick-A.obj", wp)
    test("sphere+thin-A.obj", "sphere+thick-B.obj", wp)
    test("sphere+thin-B.obj", "sphere+thick-A.obj", wp)
    test("sphere+thin-B.obj", "sphere+thick-B.obj", wp)

    test("sphere+thick-A.obj", "sphere+thin-A.obj", wp)
    test("sphere+thick-A.obj", "sphere+thin-B.obj", wp)
    test("sphere+thick-B.obj", "sphere+thin-A.obj", wp)
    test("sphere+thick-B.obj", "sphere+thin-B.obj", wp)

    test("lens-clamp-A.obj", "lens-clamp-B.obj", wp)
    test("lens-clamp-B.obj", "lens-clamp-A.obj", wp)


