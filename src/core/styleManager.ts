import { SecureFileSystem } from "./fs";
import { getStylesFile } from "./constants";
import { CategoryStyle } from "./interfaces";

export class StyleManager {
  private _styles: Record<string, CategoryStyle> = {};

  constructor(
    private _promptBuilderDir: string,
    private _fs: SecureFileSystem,
  ) {
    this.loadStyles();
  }

  public setPromptBuilderDir(dir: string) {
    this._promptBuilderDir = dir;
    this.loadStyles();
  }

  public reload() {
    this.loadStyles();
  }

  private loadStyles() {
    try {
      const stylesFile = getStylesFile(this._promptBuilderDir);
      if (this._fs.existsSync(stylesFile)) {
        this._styles = JSON.parse(
          this._fs.readFileSync(stylesFile, "utf8").toString(),
        );
      }
    } catch (e) {
      this._styles = {};
    }
  }

  private saveStyles() {
    try {
      const stylesFile = getStylesFile(this._promptBuilderDir);
      this._fs.writeFileSync(
        stylesFile,
        JSON.stringify(this._styles, null, 2),
        "utf8",
      );
    } catch (e) {
      console.error("Failed to save styles", e);
    }
  }

  public getStyle(category: string): CategoryStyle {
    if (this._styles[category]) {
      return this._styles[category];
    }

    // Generate color deterministically based on name for stability if re-assigned
    let hash = 0;
    for (let i = 0; i < category.length; i++) {
      hash = category.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;

    const style: CategoryStyle = {
      color: `hsla(${hue}, 70%, 50%, 0.05)`,
      borderColor: `hsla(${hue}, 70%, 40%, 0.3)`,
    };

    this._styles[category] = style;
    this.saveStyles();
    return style;
  }
}
