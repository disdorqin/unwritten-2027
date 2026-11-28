# 宿主适配层（Friend1 继续实施）
已初始化 three-object-descriptor.ts：通用Group世界包围盒登记，实际测试覆盖旋转/平移资产，不执行GPU上传。以下仍待实施。
- three-render-port.ts：实现 RenderPort，负责实际 Three BufferGeometry、Mesh、材质/纹理共享、bounds、引用与释放；只优化视觉，不触碰碰撞或权威。
- world-chunk-adapter.ts：读取现有 Group、矩阵、空间分块、owner/revision；支持新增地形、建筑、森林、设施，不允许硬编码某个山域或模型名称。不可批处理对象保留旧路径。
- worker-mesh-builder.ts / mesh.worker.ts：实现 MeshBuilder，typed arrays/transferables、线程池、取消/过期版本、错误退回旧网格。
- gpu-timer.ts：WebGL2异步查询，unsupported/disjoint返回null；不得阻塞或伪造GPU耗时。
- host-bridge.ts：由总控/A/D2接入viewer，默认关闭可回退；无需建模窗导入引擎。
这些文件目前未实现，不能宣称生产优化完成。