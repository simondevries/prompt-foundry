import lean from './templates/lean.json';
import hybrid from './templates/hybrid.json';
import userStory from './templates/user-story.json';
import hierarchical from './templates/hierarchical.json';
import narrative from './templates/narrative.json';
import rfc from './templates/rfc.json';
import adr from './templates/adr.json';
import bdd from './templates/bdd.json';
import executable from './templates/executable.json';

export interface Template {
  id: string;
  title: string;
  description: string;
  content: string;
}

export const TEMPLATES: Template[] = [
  lean,
  hybrid,
  userStory,
  hierarchical,
  narrative,
  rfc,
  adr,
  bdd,
  executable
];
