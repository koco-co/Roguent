import { useT } from "../i18n";
import { useSpriteTick } from "./sprite-tick";

// 自绘像素黑猫(0x72 atlas 无猫),移植自原型 hud.jsx 的 CatPet。2 帧摆尾待机;
// 跟随由父级 transform 控制(纯陪伴,无功能)。
const O = "#15131c";
const BODY = "#2b2733";
const HI = "#3d3947";
const EYE = "#36c5e0";

type Cell = [number, number, number, number, string];

/** 像素黑猫:14×14 viewBox,摆尾 2 帧。scale 控制渲染尺寸。 */
export function CatPet({ scale = 4 }: { scale?: number }) {
  const translate = useT();
  const t = useSpriteTick();
  const tail = Math.floor(t / 2) % 2 === 0;
  const cells: Cell[] = [
    [4, 2, 1, 2, O],
    [7, 2, 1, 2, O],
    [4, 3, 4, 1, O], // 耳朵
    [3, 4, 6, 4, BODY],
    [3, 4, 6, 1, O],
    [3, 7, 6, 1, O],
    [3, 4, 1, 4, O],
    [8, 4, 1, 4, O],
    [4, 5, 1, 1, EYE],
    [7, 5, 1, 1, EYE],
    [4, 4, 4, 1, HI],
    [4, 8, 5, 3, BODY],
    [4, 8, 5, 1, O],
    [4, 10, 5, 1, O],
    [3, 8, 1, 3, O],
    [9, 8, 1, 3, O],
    [4, 11, 1, 2, O],
    [8, 11, 1, 2, O], // 腿
    tail ? [10, 6, 2, 1, O] : [10, 5, 1, 3, O],
    tail ? [11, 4, 1, 3, O] : [11, 7, 2, 1, O],
  ];
  return (
    <svg
      width={14 * scale}
      height={14 * scale}
      viewBox="0 0 14 14"
      style={{ shapeRendering: "crispEdges", imageRendering: "pixelated" }}
      role="img"
    >
      <title>{translate("黑猫伙伴")}</title>
      {cells.map((c, i) => (
        <rect
          // biome-ignore lint/suspicious/noArrayIndexKey: 静态像素艺术,顺序固定
          key={i}
          x={c[0]}
          y={c[1]}
          width={c[2]}
          height={c[3]}
          fill={c[4]}
        />
      ))}
    </svg>
  );
}
