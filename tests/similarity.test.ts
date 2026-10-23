import { describe, expect, test } from "bun:test"
import { createChildNode, createMap } from "../src/domain/graphOps"
import type { NodeId } from "../src/domain/ids"
import { rankCandidates, referenceBlock } from "../src/domain/references"
import { similarity, similarNodes, tokenize } from "../src/domain/similarity"
import type { ChatMap } from "../src/domain/types"

const rootIdOf = (map: ChatMap): NodeId =>
  map.rootNodeId ?? (Object.values(map.nodes)[0]?.id as NodeId)

const talk = (map: ChatMap, nodeId: string, q: string, a: string): ChatMap => {
  const node = map.nodes[nodeId]
  if (node === undefined) return map
  const stamp = `${Date.now().toString(36)}_${node.messages.length}`
  return {
    ...map,
    nodes: {
      ...map.nodes,
      [nodeId]: {
        ...node,
        messages: [
          ...node.messages,
          {
            id: `u_${stamp}`,
            role: "user",
            content: q,
            createdAt: new Date().toISOString(),
          },
          {
            id: `a_${stamp}`,
            role: "assistant",
            content: a,
            createdAt: new Date().toISOString(),
          },
        ],
      },
    },
  }
}

describe("tokenize", () => {
  test("produces CJK bigrams and latin words while dropping stopwords", () => {
    // Given mixed zh/en text
    const tokens = tokenize("DDNS 动态域名解析 the")
    // Then latin stopwords are gone, latin words and CJK bigrams survive
    expect(tokens).toContain("ddns")
    expect(tokens).not.toContain("the")
    expect(tokens).toContain("动态")
    expect(tokens).toContain("域名")
  })
})

describe("similarity", () => {
  test("scores related texts above unrelated ones", () => {
    // Given a DDNS topic and two candidates
    const target = "DDNS 动态域名解析 公网 IP"
    const near = "动态域名解析服务 DDNS 与公网 IP 的关系"
    const far = "苹果手机 保值率 二手市场"
    // Then the related candidate scores higher and the unrelated one is zero
    expect(similarity(target, near)).toBeGreaterThan(similarity(target, far))
    expect(similarity(target, far)).toBe(0)
  })
})

describe("similarNodes", () => {
  test("ranks nodes across maps and excludes the target", () => {
    // Given a network map whose root and child both discuss DDNS/port mapping
    const m1 = createMap("网络")
    const r1 = rootIdOf(m1)
    const withRootTalk = talk(m1, r1, "DDNS 怎么配置", "DDNS 动态域名解析需要公网 IP 与端口映射")
    const child = createChildNode(withRootTalk, {
      parentId: r1,
      direction: "right",
      title: "端口映射",
    })
    const m1c = talk(
      child?.map as ChatMap,
      child?.node.id as NodeId,
      "端口映射怎么配",
      "把公网 IP 的请求转发到内网设备的端口映射规则",
    )
    // And a phone map with unrelated content
    const m2 = createMap("手机")
    const r2 = rootIdOf(m2)
    const m2b = talk(m2, r2, "iPhone 保值率", "苹果手机二手保值率与安卓对比")
    // When similar nodes are ranked for the DDNS root
    const ranked = similarNodes([m1c, m2b], String(m1c.id), String(r1), 5)
    // Then the target is excluded, a related node scores above zero, and it belongs to the network map
    expect(ranked.every((n) => n.nodeId !== String(r1))).toBe(true)
    expect(ranked.length).toBeGreaterThan(0)
    expect(ranked[0]?.score).toBeGreaterThan(0)
    expect(ranked[0]?.mapTitle).toBe("网络")
  })
})

describe("rankCandidates", () => {
  test("finds reference candidates by lexical match", () => {
    // Given candidate nodes from two maps
    const candidates = [
      {
        mapId: "m1",
        nodeId: "n1",
        mapTitle: "网络",
        title: "DDNS 配置",
        text: "动态域名解析与公网 IP",
      },
      {
        mapId: "m2",
        nodeId: "n2",
        mapTitle: "手机",
        title: "保值率",
        text: "二手市场行情",
      },
    ]
    // When searching for DDNS and public IP
    const ranked = rankCandidates("DDNS 公网", candidates)
    // Then the network node ranks first with a positive score
    expect(ranked[0]?.nodeId).toBe("n1")
    expect(ranked[0]?.score).toBeGreaterThan(0)
  })
})

describe("referenceBlock", () => {
  test("formats references with source labels", () => {
    // Given two references from different maps
    const block = referenceBlock([
      {
        mapTitle: "网络",
        nodeTitle: "DDNS 配置",
        content: "需要公网 IP",
        score: 0.6,
      },
      {
        mapTitle: "手机",
        nodeTitle: "保值率",
        content: "苹果更保值",
        score: 0.3,
      },
    ])
    // Then both sources are labelled inside a cross-map reference block
    expect(block).toContain("跨图引用")
    expect(block).toContain("网络 › DDNS 配置")
    expect(block).toContain("手机 › 保值率")
  })
})
