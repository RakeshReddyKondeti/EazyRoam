// SVG sprite ported from the prototype. Render <IconSprite /> once; use <Icon name="bus" /> anywhere.
export type IconName = "bus" | "train" | "roll" | "chair" | "lift" | "clock" | "plus" | "back" | "ramp";

export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <symbol id="i-bus" viewBox="0 0 24 24">
        <rect x="4" y="3" width="16" height="14" rx="3" />
        <path d="M4 11h16M8 20v-3M16 20v-3" />
      </symbol>
      <symbol id="i-train" viewBox="0 0 24 24">
        <rect x="5" y="3" width="14" height="13" rx="4" />
        <path d="M5 10h14M9 20l1.5-4M15 20l-1.5-4" />
      </symbol>
      <symbol id="i-roll" viewBox="0 0 24 24">
        <circle cx="11" cy="14" r="6" />
        <path d="M11 14l3-9h4" />
      </symbol>
      <symbol id="i-chair" viewBox="0 0 24 24">
        <circle cx="10" cy="4" r="1.6" />
        <path d="M10 7v6h6l2 5" />
        <path d="M15.5 17.5A5.5 5.5 0 1 1 7 11" />
      </symbol>
      <symbol id="i-lift" viewBox="0 0 24 24">
        <rect x="5" y="3" width="14" height="18" rx="3" />
        <path d="M9 9l3-3 3 3M9 15l3 3 3-3" />
      </symbol>
      <symbol id="i-clock" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l3 2" />
      </symbol>
      <symbol id="i-plus" viewBox="0 0 24 24">
        <rect x="4" y="4" width="16" height="16" rx="5" />
        <path d="M12 8v8M8 12h8" />
      </symbol>
      <symbol id="i-back" viewBox="0 0 24 24">
        <path d="M15 5l-7 7 7 7" />
      </symbol>
      <symbol id="i-ramp" viewBox="0 0 24 24">
        <path d="M3 19h18L21 9z" />
        <path d="M7 15l2 2M11 13l2 2" />
      </symbol>
    </svg>
  );
}

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="i" aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}
