/** 模型 id → 简短展示名(抽屉副标 / 任何只需短名处)。未知 id 回落原串,缺省回落 "—"。
 *  与 ModelPicker 的卡片数据同源 id,但此处只保留 id→短名,避免重复整块模型数据。 */
const MODEL_LABELS: Record<string, string> = {
  "claude-opus-4-8": "Opus 4.8",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-haiku-4-5-20251001": "Haiku 4.5",
};

export function modelLabel(id: string | undefined): string {
  if (!id) return "—";
  return MODEL_LABELS[id] ?? id;
}
