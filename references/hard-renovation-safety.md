# Hard Renovation Safety

Use this when the user asks to simulate wall removal, structural openings, or hard-renovation decisions.

## Load-Bearing Policy

- A normal floor plan image is not enough to identify load-bearing walls.
- Treat every unverified wall as `unknown`.
- Unknown walls are locked and non-demolishable.
- A wall becomes demolishable only after the user supplies credible structural status and it is recorded as `nonLoadBearing`.
- Load-bearing walls must stay locked in this prototype. Do not propose beam sizing, post sizing, or approval-ready structural substitutions.

## Required User Data

Ask for these when precision matters:
- structural drawings or developer/property-management marked-up plan
- ceiling height
- wall thickness
- door and window width/height/sill height
- pipe shaft, beam, column, and utility riser positions
- site measurements for any area used for built-in appliances or cabinets

## UX Wording

Use firm language:
- "普通户型图无法可靠判断承重属性。"
- "补充结构资料前不可模拟拆除。"
- "该工具只做方案预览，不输出施工许可或结构安全结论。"

## Reference Direction

- buildingSMART IFC models openings as voids in walls, then relates doors/windows as elements filling those openings.
- Planning Portal guidance says a structural engineer or surveyor can determine whether a wall is load-bearing and design support if needed.
- This skill follows that conservative model: opening geometry can be previewed, but structural safety must come from verified data.
