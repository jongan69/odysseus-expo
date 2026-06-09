import { Icon } from "@/components/icon";
import { CopyButton } from "@/components/chat/copy-button";
import transform, { type StyleTuple } from "css-to-react-native";
import { FileText } from "lucide-react-native";
import React, {
  memo,
  useCallback,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type TextStyle,
} from "react-native";
import SyntaxHighlighter from "react-syntax-highlighter";
import { githubGist, irBlack } from "react-syntax-highlighter/dist/esm/styles/hljs";

type HighlighterStyleSheet = { [key: string]: TextStyle };
type ReactStyle = { [key: string]: CSSProperties };

interface RendererNode {
  children?: RendererNode[];
  properties?: {
    className?: string[];
  };
  tagName?: string;
  value?: string;
}

const ALLOWED_STYLE_PROPERTIES: Record<string, boolean> = {
  color: true,
  background: true,
  backgroundColor: true,
  fontWeight: true,
  fontStyle: true,
};

const cleanStyle = (style: CSSProperties) => {
  const styles = Object.entries(style)
    .filter(([key]) => ALLOWED_STYLE_PROPERTIES[key])
    .map<StyleTuple>(([key, value]) => [key, String(value)]);
  return transform(styles);
};

const getRNStylesFromHljsStyle = (
  hljsStyle: ReactStyle,
): HighlighterStyleSheet => {
  return Object.fromEntries(
    Object.entries(hljsStyle).map(([className, style]) => [
      className,
      cleanStyle(style),
    ]),
  );
};

function trimNewlines(string: string): string {
  let start = 0;
  let end = string.length;
  while (start < end && (string[start] === "\r" || string[start] === "\n")) {
    start++;
  }
  while (
    end > start &&
    (string[end - 1] === "\r" || string[end - 1] === "\n")
  ) {
    end--;
  }
  return start > 0 || end < string.length ? string.slice(start, end) : string;
}

// Pre-compute stylesheets for both themes
const darkStylesheet = getRNStylesFromHljsStyle(irBlack as ReactStyle);
const lightStylesheet = getRNStylesFromHljsStyle(githubGist as ReactStyle);

const DOCUMENT_FENCE_LANGUAGES = new Set([
  "create_document",
  "edit_document",
  "update_document",
  "suggest_document",
]);

const CONTENT_LANGUAGES = new Set([
  "bash",
  "c",
  "cpp",
  "csv",
  "css",
  "email",
  "go",
  "html",
  "ini",
  "java",
  "javascript",
  "json",
  "jsx",
  "kotlin",
  "markdown",
  "md",
  "php",
  "plain",
  "py",
  "python",
  "ruby",
  "rust",
  "sh",
  "sql",
  "swift",
  "text",
  "toml",
  "ts",
  "tsx",
  "typescript",
  "xml",
  "yaml",
  "yml",
]);

interface CodeBlockProps {
  code: string;
  language?: string;
}

export const CodeBlock = memo(function CodeBlock({
  code,
  language,
}: CodeBlockProps) {
  if (isDocumentFence(language)) {
    return <DocumentFenceBlock code={code} action={language} />;
  }

  return <HighlightedCodeBlock code={code} language={language} />;
});

function HighlightedCodeBlock({ code, language }: CodeBlockProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const stylesheet = isDark ? darkStylesheet : lightStylesheet;
  const languageLabel = labelForLanguage(language);

  const baseStyle = useMemo(
    () =>
      StyleSheet.flatten([
        styles.text,
        { color: stylesheet.hljs?.color || (isDark ? "#f8f8f2" : "#333") },
      ]),
    [stylesheet, isDark],
  );

  const containerStyle = useMemo(
    () => [
      styles.container,
      { backgroundColor: isDark ? "#1a1a1a" : "#f6f8fa" },
    ],
    [isDark],
  );

  const getStylesForNode = useCallback(
    (node: RendererNode): TextStyle[] => {
      const classes: string[] = node.properties?.className ?? [];
      return classes
        .map((c: string) => stylesheet[c])
        .filter((c) => !!c) as TextStyle[];
    },
    [stylesheet],
  );

  const renderNodeChildren = useCallback(
    function renderChildren(nodes: RendererNode[], keyPrefix = "row"): ReactNode[] {
      return nodes.reduce<ReactNode[]>((acc, node, index) => {
        const keyPrefixWithIndex = `${keyPrefix}_${index}`;
        if (node.children) {
          const nodeStyles = getStylesForNode(node);
          const textStyles = nodeStyles.length > 0 ? nodeStyles : undefined;
          acc.push(
            <Text style={textStyles} key={keyPrefixWithIndex}>
              {renderChildren(node.children, `${keyPrefixWithIndex}_child`)}
            </Text>,
          );
        }
        if (node.value) {
          acc.push(trimNewlines(String(node.value)));
        }
        return acc;
      }, []);
    },
    [getStylesForNode],
  );

  const renderer = useCallback(
    (props: any) => {
      const { rows } = props;
      return (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.codeContent}>
            {rows.map((row: RendererNode, index: number) => (
              <Text key={`row_${index}`} style={baseStyle}>
                {renderNodeChildren(row.children || [], `row_${index}`)}
              </Text>
            ))}
          </View>
        </ScrollView>
      );
    },
    [renderNodeChildren, baseStyle],
  );

  return (
    <View style={containerStyle}>
      <View className="flex-row items-center justify-between border-b border-border bg-muted/40 px-3 py-1.5">
        <Text
          numberOfLines={1}
          className="font-mono text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {languageLabel}
        </Text>
        <CopyButton text={code} label="Copy code" />
      </View>
      <SyntaxHighlighter
        renderer={renderer}
        CodeTag={View as any}
        PreTag={View as any}
        style={undefined}
        customStyle={{ backgroundColor: "transparent" }}
        language={language || "typescript"}
      >
        {code}
      </SyntaxHighlighter>
    </View>
  );
}

function DocumentFenceBlock({
  action,
  code,
}: {
  action?: string;
  code: string;
}) {
  const document = parseDocumentFence(code);
  const actionLabel =
    action === "edit_document" || action === "update_document"
      ? "Document update"
      : action === "suggest_document"
        ? "Document suggestion"
        : "Document";

  return (
    <View className="my-1 overflow-hidden rounded-xl border border-border bg-muted/35 border-continuous">
      <View className="flex-row items-center gap-2 border-b border-border bg-muted/50 px-3 py-2">
        <View className="h-7 w-7 items-center justify-center rounded-lg bg-background/70">
          <Icon icon={FileText} className="h-4 w-4 text-muted-foreground" />
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-sm font-semibold text-foreground">
            {document.title}
          </Text>
          <Text
            numberOfLines={1}
            className="font-mono text-[11px] uppercase text-muted-foreground"
          >
            {[actionLabel, document.language].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <CopyButton text={document.content} label="Copy document" />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.documentScrollContent}
      >
        <Text selectable style={styles.documentText}>
          {document.content || code}
        </Text>
      </ScrollView>
    </View>
  );
}

function isDocumentFence(language?: string) {
  return DOCUMENT_FENCE_LANGUAGES.has((language || "").trim().toLowerCase());
}

function labelForLanguage(language?: string) {
  const value = (language || "").trim();
  return value || "text";
}

function parseDocumentFence(code: string) {
  const normalized = trimNewlines(code.replace(/\r\n/g, "\n"));
  const lines = normalized.split("\n");
  const title = lines.shift()?.trim() || "Untitled document";
  const maybeLanguage = lines[0]?.trim().toLowerCase() || "";
  const language = CONTENT_LANGUAGES.has(maybeLanguage) ? lines.shift()?.trim() : "";
  const content = trimNewlines(lines.join("\n"));
  return {
    title,
    language: language || "text",
    content: content || normalized,
  };
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    marginVertical: 4,
    overflow: "hidden",
  },
  scrollContent: {
    minWidth: "100%",
  },
  codeContent: {
    padding: 12,
  },
  documentScrollContent: {
    minWidth: "100%",
    padding: 12,
  },
  documentText: {
    color: "#9cdef2",
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Platform.select({ ios: "monospace-ui", default: "monospace" }),
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Platform.select({ ios: "monospace-ui", default: "monospace" }),
  },
});
