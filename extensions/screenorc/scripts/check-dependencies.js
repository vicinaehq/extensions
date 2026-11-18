const { execSync } = require("node:child_process");

const missing = ["spectacle", "tesseract", "zbarimg"].filter((cmd) => {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return false;
  } catch {
    return true;
  }
});

if (missing.length) {
  console.error(`Missing dependencies: ${missing.join(", ")}`);
  process.exit(1);
}
console.log("All dependencies found.");