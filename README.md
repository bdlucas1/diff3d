This Python program provides a simple and robust way to visually
compare 3d files such as STL, OBJ, 3MF, and STEP. The unchanged parts
of the objects are shown in gray, while the changed parts are shown in
contrasting colors that stand out, illustrated by the following
example.

<img src="examples/scheme1.png" width="50%">

In this example most of the lens clamp is unchanged and is displayed
in gray, while the differing parts are displayed in red for one file
and green for the other file: in the red file the diameter was smaller,
while in the green file the base was longer, and the threaded hole has
been moved.


### Quick start

    git clone https://github.com/bdlucas1/diff3d
    cd diff3d
    pip install -r requirements.txt
    python diff3d.py examples/lens-clamp-A.stl examples/lens-clamp-B.stl

The diff3d command may take up to about a minute to run the first time
while it loads and compiles the supporting packages, but after that
the startup time will be very quick.

You can drag the displayed object to rotate it, use the mouse wheel to
zoom, and shift-drag to pan.

If there is enough interest I'll look into publishing this as a
pip-installable package.


### Supported formats and object types

Out of the box diff3d supports STL, OBJ, and 3MF files. Support for a
number of additional file types is available by installing `meshio`,
and support for STEP files can be enabled by installing `build123d`.

Unlike other tools that do 3d diffs by using 3d boolean operations
like intersection and difference, this tool is robust and is not
limited to manifold (close surface) meshes, but can diff anything that
can be rendered, including open surfaces, curves, and points.


### Color schemes

Three color schemes designed to be colorblind-friendly are
provided. (This is based on information from
https://davidmathlogic.com/colorblind, and I have not verified
this. If you have information to add please contact me by opening an
issue on github.)

<img src="examples/scheme1.png" width="30%"><img src="examples/scheme2.png" width="30%"><img src="examples/scheme3.png" width="30%">

You can choose a scheme using the `-s` or `--scheme` option.  The
above schemes are named "1", "2", and "3" respectively.


### API

The diff3d module provides a simple API if you want to integrate it
into your own program. See the code for details.

* `diff3d.from_files` opens a window displaying the diff between two files

* `diff3d.diff` opens a window displaying the diff between two pyvista objects.

* If you are using a different mesh or CAD package, if you can obtain
  point and triangle arrays, you can convert them to pyvista objects
  using `pyvista.PolyData.from_regular_faces`
