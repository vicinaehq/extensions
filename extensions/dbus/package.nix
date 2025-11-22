{ mkVicinaeExtension, node-gyp }:
mkVicinaeExtension {
  name = "dbus";
  src = ./.;
  buildInputs = [ node-gyp ];
}
