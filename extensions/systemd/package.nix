{ mkVicinaeExtension, node-gyp }:
mkVicinaeExtension {
  name = "systemd";
  src = ./.;
  buildInputs = [ node-gyp ];
}
