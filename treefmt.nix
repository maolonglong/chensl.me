{pkgs, ...}: {
  projectRootFile = "flake.nix";
  programs.alejandra.enable = true;
  settings.formatter.alejandra.excludes = ["./themes/**"];
  programs.taplo.enable = true;
  settings.formatter.taplo.excludes = ["./themes/**"];
  programs.prettier = {
    enable = true;
    includes = [
      "./archetypes/*.md"
      "./content/**/*.md"
      "./README.md"
    ];
  };
}
