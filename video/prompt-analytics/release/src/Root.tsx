import { Composition } from "remotion";
import { Release } from "./Release";
import tl from "./timeline.json";

export const Root = () => (
  <Composition id="Release" component={Release} durationInFrames={tl.total} fps={tl.fps} width={1920} height={1080} />
);
