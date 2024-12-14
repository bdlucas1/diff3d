import pyvista

# colorblind-friendly color schemes per https://davidmathlogic.com/colorblind
color_schemes = {
    "1": ("green", "red", (0, 250, 0)),
    "2": ("blue", "orange", (0, 100, 250)),
    "3": ("purple", "yellow", (100, 75, 250)),
}


def diff(o1, o2, scheme="1", alpha=0.25, title="diff3d", **kwargs):

    # for interoperability with other vtk-based libraries
    # TODO: add more?
    def convert(o):
        if "vedo" in str(type(o)):
            o = o.dataset
        return o
    o1, o2 = convert(o1), convert(o2)

    # accept lists and tuples of objects
    if isinstance(o1, (list,tuple)):
        o1 = pyvista.MultiBlock([convert(o) for o in o1])
    if isinstance(o2, (list,tuple)):
        o2 = pyvista.MultiBlock([convert(o) for o in o2])

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

    """
    if o2:
        pl.add_mesh(convert(o1), color=color1, opacity=alpha, **kwargs)
        pl.add_mesh(convert(o2), color=color2, opacity=alpha, **kwargs)
    else:
        pl.add_mesh(o1)
    """

    def mute(c, x):
        import numpy as np
        c = np.array(c) / 255
        muted = (c + 1 * np.array([1,1,1])) / 2
        c = (1-x) * c + x * muted
        return c

    def callback(x):
        if -0.15 < x < 0.15:
            x = 0
        c1, c2 = color1, color2
        if x < 0:
            y = x + 1  # 0 to 1
            alpha1 = 1 * (1-y) + alpha * y
            alpha2 = 0 * (1-y) + alpha * y
            c1 = mute(color1, -x)
        else:
            alpha1 = alpha * (1-x) + 0 * x
            alpha2 = alpha * (1-x) + 1 * x
            c2 = mute(color2, x)

        if hasattr(pl, "actor1"):
            pl.remove_actor(pl.actor1, render=False)
            pl.remove_actor(pl.actor2, render=False)
        pl.actor1 = pl.add_mesh(o1, color=c1, opacity=alpha1, **kwargs, render=False)
        pl.actor2 = pl.add_mesh(o2, color=c2, opacity=alpha2, **kwargs, render=False)
        pl.render()

    pl.add_slider_widget(
        callback, (-1,1), value=0, interaction_event="always",
        style="modern", pointa=(0.2,0.99), pointb=(0.8,0.99),
    )

    callback(0)

    pl.show()


def load(path):
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
        return blocks
    else:
        return pyvista.read(path)


def from_files(path1, path2, scheme="1", title=None):
    if title is None:
        title = (path1, path2) if path2 else path1
    o1 = load(path1)
    o2 = load(path2) if path2 else None
    diff(o1, o2, scheme=scheme, title=title)

if __name__ == "__main__":

    #import sys
    import argparse

    parser = argparse.ArgumentParser(
        prog = 'diff3d',
        description = 'Visual diff for 3d files',
    )
    
    parser.add_argument('file1')
    parser.add_argument('file2', nargs='?')
    parser.add_argument(
        '-s', '--scheme',
        choices = color_schemes.keys(),
        default = "1",
        help = "Color scheme",
    )
    args = parser.parse_args()

    pyvista.global_theme.color = (0.70, 0.80, 1.0)
    pyvista.global_theme.line_width = 3
    pyvista.global_theme.point_size = 8
    pyvista.global_theme.window_size = (1500, 1500)
    from_files(args.file1, args.file2, scheme=args.scheme)

