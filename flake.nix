{
  description = "Extensions for the Vicinae launcher";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";

    systems.url = "github:nix-systems/default";

    vicinae = {
      url = "github:vicinaehq/vicinae";
      inputs = {
        nixpkgs.follows = "nixpkgs";
        systems.follows = "systems";
      };
    };
  };

  nixConfig = {
    extra-substituters = [ "https://vicinae.cachix.org" ];
    extra-trusted-public-keys = [ "vicinae.cachix.org-1:1kDrfienkGHPYbkpNj1mWTr7Fm1+zcenzgTizIcI3oc=" ];
  };

  outputs =
    {
      self,
      nixpkgs,
      systems,
      vicinae,
    }:
    let
      inherit (nixpkgs) lib;
      forEachSystem =
        f:
        lib.genAttrs (import systems) (
          system:
          f {
            inherit system;
            pkgs = nixpkgs.legacyPackages.${system};
          }
        );
    in
    {
      packages = forEachSystem (
        { system, ... }:
        lib.pipe (builtins.readDir ./extensions) [
          (lib.filterAttrs (_name: type: type == "directory"))
          (lib.mapAttrs (
            name: _type:
            vicinae.packages.${system}.mkVicinaeExtension {
              pname = name;
              src = ./extensions/${name};
            }
          ))
          (lib.flip builtins.removeAttrs [
            # TODO: fails to build due to node-gyp
            "dbus"
            "systemd"
          ])
        ]
      );

      # Build each package instead of just checking they are derivations
      checks = forEachSystem ({ system, ... }: self.packages.${system});

      devShells = forEachSystem (
        { pkgs, system }:
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              vicinae.packages.${system}.default
              self.formatter.${system}
              nodejs
              typescript-language-server
            ];
          };
        }
      );

      formatter = forEachSystem ({ pkgs, ... }: pkgs.nixfmt-tree);
    };
}
