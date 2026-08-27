import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * 合并 className。
 *
 * clsx 负责条件拼接，tailwind-merge 负责去掉互相冲突的 Tailwind 工具类——
 * 后者是必须的：`cn("px-4", condition && "px-6")` 在纯拼接下会同时留着两个
 * padding，最终生效的取决于 CSS 里谁在后面，而不是取决于条件。
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
