export const terminal = (command: string) =>
  `xdg-terminal-exec --app-id=com.omarchy.Omarchy ${command}`;

export const open_in_editor = (file: string) =>
  `notify-send "Editing config file" "${file}" && omarchy-launch-editor ${file}`;

export const present_terminal = (command: string) =>
  `omarchy-launch-floating-terminal-with-presentation ${command}`;

export const install = (name: string, pkg: string) =>
  present_terminal(
    `echo 'Installing ${name}...'; sudo pacman -S --noconfirm ${pkg}`,
  );

export const install_and_launch = (name: string, pkg: string, app: string) =>
  present_terminal(
    `echo 'Installing ${name}...'; sudo pacman -S --noconfirm ${pkg} && setsid gtk-launch ${app}`,
  );

export const install_font = (name: string, pkg: string, font: string) =>
  present_terminal(
    `echo 'Installing ${name}...'; sudo pacman -S --noconfirm --needed ${pkg} && sleep 2 && omarchy-font-set '${font}'`,
  );

export const install_terminal = (terminalName: string) =>
  present_terminal(`omarchy-install-terminal ${terminalName}`);

export const aur_install_and_launch = (
  name: string,
  pkg: string,
  app: string,
) =>
  present_terminal(
    `echo 'Installing ${name} from AUR...'; yay -S --noconfirm ${pkg} && setsid gtk-launch ${app}`,
  );
