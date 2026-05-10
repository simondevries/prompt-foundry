import { SecureFileSystem } from "./fs";
import { getAssociationsFile } from "./constants";

export type AssociationData = Record<string, Record<string, number>>;

/**
 * Manages co-occurrence associations between prompt blocks.
 * Learned associations are persisted to a JSON file.
 */
export class AssociationManager {
  private _associations: AssociationData = {};

  constructor(
    private _promptBuilderDir: string,
    private _fs: SecureFileSystem,
  ) {
    this.loadAssociations();
  }

  public setPromptBuilderDir(dir: string) {
    this._promptBuilderDir = dir;
    this.loadAssociations();
  }

  private loadAssociations() {
    try {
      const associationsFile = getAssociationsFile(this._promptBuilderDir);
      if (this._fs.existsSync(associationsFile)) {
        this._associations = JSON.parse(
          this._fs.readFileSync(associationsFile, "utf8").toString(),
        );
      } else {
        this._associations = {};
      }
    } catch (e) {
      console.error("Failed to load associations", e);
      this._associations = {};
    }
  }

  private saveAssociations() {
    try {
      const associationsFile = getAssociationsFile(this._promptBuilderDir);
      this._fs.writeFileSync(
        associationsFile,
        JSON.stringify(this._associations, null, 2),
        "utf8",
      );
    } catch (e) {
      console.error("Failed to save associations", e);
    }
  }

  /**
   * Tracks a new set of active blocks. Only records associations 
   * between each block and all others in the list.
   * Format: category:name
   */
  public recordAddition(newBlockKey: string, activeKeys: string[]) {
    if (!this._associations[newBlockKey]) {
      this._associations[newBlockKey] = {};
    }

    // For the newly added block, increment counts for all other active blocks
    for (const otherKey of activeKeys) {
      if (otherKey === newBlockKey) continue;

      // Update both ways for symmetric co-occurrence
      this._increment(newBlockKey, otherKey);
      this._increment(otherKey, newBlockKey);
    }

    this.saveAssociations();
  }

  private _increment(key1: string, key2: string) {
    if (!this._associations[key1]) {
      this._associations[key1] = {};
    }
    this._associations[key1][key2] = (this._associations[key1][key2] || 0) + 1;
  }

  /**
   * Returns the best suggestion based on current active blocks.
   * Aggregates the association strength of all candidates and picks the winner.
   */
  public getSuggestions(activeKeys: string[], availableBlocks: { category: string, name: string }[]): { category: string, name: string }[] {
    if (activeKeys.length === 0) return [];

    const candidateStats: Record<string, { votes: number, score: number }> = {};
    const activeSet = new Set(activeKeys);

    // Each active block "votes" for its known associates
    for (const activeKey of activeKeys) {
      const related = this._associations[activeKey];
      if (!related) continue;

      for (const [candidateKey, count] of Object.entries(related)) {
        if (activeSet.has(candidateKey)) continue;
        
        if (!candidateStats[candidateKey]) {
          candidateStats[candidateKey] = { votes: 0, score: 0 };
        }
        
        candidateStats[candidateKey].votes += 1;
        candidateStats[candidateKey].score += count;
      }
    }

    // Sort candidates by votes (Primary) and score (Secondary)
    const sortedKeys = Object.keys(candidateStats).sort((a, b) => {
      const statsA = candidateStats[a];
      const statsB = candidateStats[b];
      if (statsB.votes !== statsA.votes) return statsB.votes - statsA.votes;
      return statsB.score - statsA.score;
    });

    const suggestions: { category: string, name: string }[] = [];
    for (const key of sortedKeys) {
      const parts = key.split(":");
      if (parts.length < 2) continue;
      const category = parts[0];
      const name = parts.slice(1).join(":");

      if (availableBlocks.find(i => i.category === category && i.name === name)) {
        suggestions.push({ category, name });
      }
    }

    return suggestions;
  }

  /**
   * Migrates association keys when an block/category is renamed.
   */
  public renameKey(oldKey: string, newKey: string) {
    // 1. Rename the primary entries
    if (this._associations[oldKey]) {
      this._associations[newKey] = this._associations[oldKey];
      delete this._associations[oldKey];
    }

    // 2. Rename all occurrences of oldKey in other blocks' lists
    for (const key of Object.keys(this._associations)) {
      const related = this._associations[key];
      if (related[oldKey]) {
        related[newKey] = related[oldKey];
        delete related[oldKey];
      }
    }

    this.saveAssociations();
  }
}
