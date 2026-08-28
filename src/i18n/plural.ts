/**
 * 英文的单复数。
 *
 * 【为什么不是 Intl.PluralRules】本项目的每一处计数都是 `n >= 0` 的基数，
 * 且没有序数后缀（"第 3 轮" 对应的是 "Mission 3" 而不是 "3rd mission"）。
 * 中文只有一个复数类别，英文只用得上 one / other 两个 —— 真正要复数的地方
 * 一只手数得过来。为它引入 ICU 那一整套是纯亏。
 *
 * 真需要 few / many（俄语、阿拉伯语）时再换成 Intl.PluralRules，
 * 换的是这一个函数，不是所有调用点。
 */
export const plural = (n: number, one: string, other: string): string =>
  n === 1 ? one : other;
