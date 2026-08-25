# components/

阶段 5 建立。规划中的组件见 docs/todos.md 阶段 5。

**唯一的硬规则**：组件的数据来源只有 `myViewAtom`。
任何组件的 props 里出现其他玩家的 `role`，都是信息泄漏，直接算 bug。
