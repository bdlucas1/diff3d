This Python program provides a simple, fast, and robust way to visually
compare 3d files such as STL, OBJ, 3MF, and STEP. The unchanged parts
of the objects are shown in gray, while the changed parts are shown in
contrasting colors that stand out, illustrated by the following
example.

<img src="https://raw.githubusercontent.com/bdlucas1/diff3d/refs/heads/master/examples/scheme1.png" width="50%">

In this example most of the lens clamp is unchanged and is displayed
in gray, while the differing parts are displayed in red for one file
and green for the other file: in the red file the diameter is smaller,
while in the green file the base is longer, and the threaded hole has
moved.


### Quick start

You will need to have Python installed. Python comes with a program
called `pip` for installing Python programs at the system level. To
install `diff3d` run this command:

    pip install diff3d

In some more recent versions of Python you may get an error that the
Python installation is managed by the OS, meaning that you can't use
`pip` to install packages like `diff3d` directly into the system
because the OS depends on a stable version of Python. In that case you
can [install pipx](https://pipx.pypa.io/stable/installation/) and use
`pipx` in place of `pip` in the command above.

Then to test the installation download two test files
[lens-clamp-A.stl](https://raw.githubusercontent.com/bdlucas1/diff3d/refs/heads/master/examples/lens-clamp-A.stl)
and
[lens-clamp-B.stl](https://raw.githubusercontent.com/bdlucas1/diff3d/refs/heads/master/examples/lens-clamp-B.stl)
and run the command

    diff3d lens-clamp-A.stl lens-clamp-B.stl

The `diff3d` command may take up to about a minute to run the first
time while it loads and compiles the supporting packages, but after
that the startup time will be very quick.

You can drag the displayed object to rotate it, use the mouse wheel to
zoom, and shift-drag to pan.

The second file is optional, in which case the first file will simply
be displayed without diffs. This allows the tool to be used as a
simple 3d file viewer in addition to its primary function.


### Supported platforms, file formats, and object types

I use MacOS, but I believe this tool works on Windows and Linux
as well. I have tested it with Python 3.12 and 3.13, but I think
it will also work on some somewhat older versions of Python.

Out of the box `diff3d` supports STL, OBJ, and 3MF files. Support for a
number of additional file types is available by installing `meshio`,
and support for STEP files can be enabled by installing `build123d`.

Unlike other tools that do 3d diffs by using 3d boolean operations
like intersection and difference, this tool is robust and is not
limited to manifold (closed surface) meshes, but can diff anything that
can be rendered, including open surfaces, curves, and points.


### Color schemes

Three color schemes designed to be colorblind-friendly are
provided. (This is based on information from
https://davidmathlogic.com/colorblind, and I have not verified
this. If you have information to add please contact me by opening an
issue on github.)

<img src="https://raw.githubusercontent.com/bdlucas1/diff3d/refs/heads/master/examples/scheme1.png" width="30%"><img src="https://raw.githubusercontent.com/bdlucas1/diff3d/refs/heads/master/examples/scheme2.png" width="30%"><img src="https://raw.githubusercontent.com/bdlucas1/diff3d/refs/heads/master/examples/scheme3.png" width="30%">

You can choose a scheme using the `-s` or `--scheme` option.  The
above schemes are named "1", "2", and "3" respectively.


### API

The `diff3d` module provides a simple API if you want to integrate it
into your own program. See the code for details.

* `diff3d.from_files` opens a window displaying the diff between two files

* `diff3d.diff` opens a window displaying the diff between two pyvista objects.

* If you are using a different mesh or CAD package, if you can obtain
  point and triangle arrays, you can convert them to pyvista objects
  using `pyvista.PolyData.from_regular_faces`
