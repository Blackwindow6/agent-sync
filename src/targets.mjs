import { CORE_TARGETS } from "./targets-core.mjs";
import { OPTIONAL_TARGETS } from "./targets-optional.mjs";

function freezeTarget(target) {
  return Object.freeze({
    ...target,
    supportedModes: Object.freeze([...target.supportedModes]),
  });
}

export const TARGETS = Object.freeze(
  [...CORE_TARGETS, ...OPTIONAL_TARGETS].map(freezeTarget),
);

export function getTarget(id) {
  return TARGETS.find((target) => target.id === id);
}

export {
  MANAGED_START,
  MANAGED_END,
  MANAGED_BANNER,
  TOML_MANAGED_START,
  TOML_MANAGED_END,
  TOML_MANAGED_BANNER,
  extractManagedBody,
  markersFor,
  mergeManagedContent,
  mergeTomlManaged,
  mergeUnmanagedToml,
  wrapManaged,
} from "./managed.mjs";
