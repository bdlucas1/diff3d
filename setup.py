from distutils.core import setup

setup(
    name = "diff3d",
    version = "0.0",
    py_modules = ["diff3d"],
    entry_points = {
        "console_scripts": ["diff3d = diff3d:cli"],
    },
    package_dir = {"diff3d": "diff3d"},
    package_data = {"diff3d/examples": ["examples/*"]},
    install_requires=[
        "pyvista",
        "lib3mf",
        #"build123d",
    ],
)
