{pkgs, ...}: {
  packages = [pkgs.git];

  languages = {
    nix.enable = true;
    javascript = {
      enable = true;
      pnpm.enable = true;
    };
  };

  git-hooks.hooks = {
    alejandra = {
      enable = true;
      files = "devenv.nix";
    };
    markdownlint = {
      enable = true;
      settings.configuration = {
        MD010 = false;
        MD013 = false;
        MD033 = false;
        MD045 = false;
      };
      files = "src/content/.*\\.md";
    };
  };
}
