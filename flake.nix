{
  description = "Blog development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    git-hooks.url = "github:cachix/git-hooks.nix";
    git-hooks.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = {
    self,
    systems,
    nixpkgs,
    ...
  } @ inputs: let
    forEachSystem = nixpkgs.lib.genAttrs (import systems);
  in {
    # Run the hooks with `nix fmt`.
    formatter = forEachSystem (
      system: let
        pkgs = nixpkgs.legacyPackages.${system};
        config = self.checks.${system}.pre-commit-check.config;
        inherit (config) package configFile;
        script = ''
          ${pkgs.lib.getExe package} run --all-files --config ${configFile}
        '';
      in
        pkgs.writeShellScriptBin "pre-commit-run" script
    );

    # Run the hooks in a sandbox with `nix flake check`.
    # Read-only filesystem and no internet access.
    checks = forEachSystem (system: let
      pkgs = nixpkgs.legacyPackages.${system};
    in {
      pre-commit-check = inputs.git-hooks.lib.${system}.run {
        src = ./.;
        hooks = {
          alejandra = {
            enable = true;
            files = "flake.nix";
          };
          markdownlint = {
            enable = true;
            settings.configuration = {
              MD010 = false;
              MD013 = false;
              MD033 = false;
              MD036 = false;
              MD045 = false;
            };
            files = "src/content/blog/.*\\.md";
          };
          gitleaks = {
            enable = true;
            name = "Detect hardcoded secrets";
            entry = "${pkgs.gitleaks}/bin/gitleaks git --pre-commit --redact --staged --verbose";
            language = "system";
            pass_filenames = false;
          };
        };
      };
    });

    # Enter a development shell with `nix develop`.
    # The hooks will be installed automatically.
    # Or run pre-commit manually with `nix develop -c pre-commit run --all-files`
    devShells = forEachSystem (
      system: let
        pkgs = nixpkgs.legacyPackages.${system};
        inherit (self.checks.${system}.pre-commit-check) shellHook enabledPackages;
      in {
        default = pkgs.mkShell {
          inherit shellHook;
          buildInputs = with pkgs;
            [
              alejandra
              git
              gitleaks
              nodejs
              nodePackages.pnpm
            ]
            ++ enabledPackages;
        };
      }
    );
  };
}
