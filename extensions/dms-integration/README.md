# DankMaterialShell Vicinae Extension

A Vicinae extension (`vicinae-dms-extions`) that integrates with the [DankMaterialShell](https://danklinux.com/) to:
- search indexed files with rich file-type icons using the DMS search utility,
- trigger quick/full reindex operations,
- and open DMS settings.

If you would like to add more features, do feel free to open a PR, or suggest it in the issues section. 😄

## Available Vicinae Commands

- `dsearch <optional: Folder_Scope>` (Search Files)  

  Searches files through DMS (`dsearch` backend must be [installed](https://danklinux.com/docs/danksearch/) and available on `localhost:43654`). You can optionally specify a `Folder_Scope` to limit the search to a specific directory.

>Note that by default, the `Folder_Scope` will append to your home directory. For example, if you specify `Documents`, the search will be limited to `home/$USER/>Documents`. If you want to specify an absolute path, you can start your `Folder_Scope` with `/` (e.g., `/path/to/folder`). If you do, make sure `dsearch` is >configured to allow searching in that path.


- `dsearch_index` (Reindex Files for Search)  
  Runs asynchronous indexing with a required dropdown mode argument:
  - `quick`
  - `full`

- `dsettings` (Settings)  
  Opens the DMS settings panel.
