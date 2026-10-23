import type { ChatMap } from "../domain/types"
import { api, type ImportReportDto, type MapMetaDto } from "./api"

export interface MapListDeps {
  readonly getCurrent: () => ChatMap | null
  readonly setMaps: (maps: readonly MapMetaDto[]) => void
  readonly setCurrent: (map: ChatMap | null, activeNodeId?: string | null) => void
  readonly setError: (msg: string | null) => void
}

export const refreshMapsImpl = async (deps: MapListDeps): Promise<void> => {
  try {
    deps.setMaps(await api.maps())
  } catch (e) {
    deps.setError(e instanceof Error ? e.message : "图谱列表加载失败")
  }
}

export const openMapImpl = async (id: string, deps: MapListDeps): Promise<void> => {
  try {
    const map = await api.map(id)
    if (map === null) {
      deps.setError("图谱不存在")
      return
    }
    deps.setCurrent(map, map.rootNodeId ?? Object.keys(map.nodes)[0] ?? null)
  } catch (e) {
    deps.setError(e instanceof Error ? e.message : "图谱加载失败")
  }
}

export const newMapImpl = async (deps: MapListDeps): Promise<void> => {
  try {
    const map = await api.createMap("新图谱")
    await refreshMapsImpl(deps)
    deps.setCurrent(map, map.rootNodeId ?? null)
  } catch (e) {
    deps.setError(e instanceof Error ? e.message : "新建失败")
  }
}

export const removeMapImpl = async (id: string, deps: MapListDeps): Promise<void> => {
  await api.deleteMap(id)
  if (deps.getCurrent()?.id === id) deps.setCurrent(null, null)
  await refreshMapsImpl(deps)
}

export const renameMapImpl = async (
  id: string,
  title: string,
  deps: MapListDeps,
): Promise<void> => {
  try {
    const updated = await api.renameMap(id, title)
    if (deps.getCurrent()?.id === id) {
      deps.setCurrent(updated)
    }
    await refreshMapsImpl(deps)
  } catch (e) {
    deps.setError(e instanceof Error ? e.message : "重命名失败")
  }
}

export const importFromImpl = async (
  source: string,
  deps: MapListDeps,
): Promise<ImportReportDto> => {
  const report = await api.importMaps(source)
  await refreshMapsImpl(deps)
  return report
}
