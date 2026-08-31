{
  description = "OpenCode Chat extension for the Vicinae launcher";

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
        { system, pkgs, ... }:
        {
          default = vicinae.packages.${system}.mkVicinaeExtension {
            pname = "opencode-chat";
            version = "0.1.0";
            src = ./.;
          };
        }
      );

      checks = forEachSystem ({ system, ... }: self.packages.${system});

      devShells = forEachSystem (
        { pkgs, system }:
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              vicinae.packages.${system}.default
              nodejs
              typescript-language-server
            ];
          };
        }
      );

      formatter = forEachSystem ({ pkgs, ... }: pkgs.nixfmt-tree);
    };
}
