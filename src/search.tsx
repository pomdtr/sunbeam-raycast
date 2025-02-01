import {
  Action,
  Detail,
  ActionPanel,
  closeMainWindow,
  getPreferenceValues,
  List,
  Icon,
} from "@raycast/api";
import { useFetch, useFrecencySorting } from "@raycast/utils"
import * as sunbeam from "@pomdtr/sunbeam"
import { fetch } from "cross-fetch"
import { useEffect, useState } from "react";

const preferences = getPreferenceValues<Preferences>();

export default function () {
  const { data, isLoading } = useFetch<sunbeam.Extension[]>(new URL("/extensions", preferences.url).href)

  const { data: items, visitItem } = useFrecencySorting(
    data?.flatMap((extension) => (extension.root || []).map((action, idx) => ({ id: `${extension.name}:${idx}`, action, extension })))
  )

  return (
    <List isLoading={isLoading}>
      {items?.map(item => (
        <List.Item
          key={item.id}
          title={item.action.title}
          subtitle={item.extension.title}
          accessories={[{ text: item.extension.name }]}
          actions={
            <ActionPanel>
              <SunbeamAction action={{ ...item.action, title: "Run", }} extension={item.extension} onAction={() => visitItem(item)} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
};

export function SunbeamAction({ action, extension, onAction, onReload: reload }: { action: sunbeam.Action; extension: sunbeam.Extension, onAction?: () => void, onReload?: (params?: sunbeam.Params) => void }) {
  switch (action.type) {
    case "copy":
      return <Action.CopyToClipboard title={action.title} content={action.text} onCopy={onAction} />;
    case "open":
      return <Action.OpenInBrowser title={action.title} url={action.url} />
    case "reload":
      return <Action icon={Icon.ArrowClockwise} title={action.title} onAction={reload ? () => reload(action.params || {}) : undefined} />
    case "run":
      const command = extension.commands?.find((command) => command.name === action.command)
      if (!command) {
        return <Action title="Command not found" />
      }

      switch (command.mode) {
        case "silent":
          return <Action icon={Icon.Play} title={action.title} onAction={async () => {
            await fetch(new URL(`/extensions/${extension.name}/${command.name}`, preferences.url), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(action.params || {}),
            })

            await closeMainWindow()
          }} />
        case "filter":
        case "search":
          return <Action.Push icon={Icon.Play} title={action.title} target={<SunbeamList command={command} extension={extension} params={action.params} />} />
        case "detail":
          return <Action.Push icon={Icon.Play} title={action.title} target={<SunbeamDetail command={command} extension={extension} params={action.params} />} />
      }
  }
}

function SunbeamList(props: { extension: sunbeam.Extension; command: sunbeam.Command; params?: sunbeam.Params }) {
  const [params, setParams] = useState<sunbeam.Params>(props.params || {})
  const [searchText, setSearchText] = useState<string>()

  const { data: list, isLoading, mutate } = useFetch<sunbeam.List>(new URL(`/extensions/${props.extension.name}/${props.command.name}`, preferences.url).href, {
    keepPreviousData: true,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...params,
      query: searchText
    }),
  })

  useEffect(() => {
    if (!list?.autoRefreshSeconds) {
      return;
    }

    const interval = setInterval(() => {
      mutate()
    }, list.autoRefreshSeconds * 1000)

    return () => clearInterval(interval)
  }, [])

  return <List
    isLoading={isLoading}
    throttle
    isShowingDetail={list?.showDetail}
    onSearchTextChange={props.command.mode === "search" ? setSearchText : undefined}
  >
    <List.EmptyView title={list?.emptyText} />
    {list?.items?.map((item, idx) => <List.Item
      key={idx}
      title={item.title}
      subtitle={item.subtitle}
      accessories={item.accessories?.map((accessory) => ({ text: accessory }))}
      detail={<ListItemDetail detail={item.detail} />}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            {item.actions?.map((action, idx) => (
              <SunbeamAction key={idx} action={action} extension={props.extension} onReload={(params) => {
                if (params) {
                  setParams(params)
                  return
                }

                mutate()
              }} />
            ))}
          </ActionPanel.Section>
        </ActionPanel>
      }
    />)}
  </List>
}

function ListItemDetail({ detail }: { detail: sunbeam.ListItem["detail"] }) {
  if (!detail) {
    return null;
  }

  if ("markdown" in detail) {
    return <Detail markdown={detail.markdown} />
  }

  const markdown = ["```", detail.text, "```"].join("\n");
  return <Detail markdown={markdown} />
}

function SunbeamDetail(props: { command: sunbeam.Command, extension: sunbeam.Extension, params?: sunbeam.Params }) {
  const { data: detail, isLoading, mutate } = useFetch<sunbeam.Detail>(new URL(`/extensions/${props.extension.name}/${props.command.name}`, preferences.url).href, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(props.params || {}),
  })

  let markdown: string | undefined;
  if (detail?.markdown) {
    markdown = detail.markdown;
  } else if (detail?.text) {
    markdown = ["```", detail.text, "```"].join("\n");
  }

  return (
    <Detail
      isLoading={isLoading}
      markdown={markdown}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            {detail?.actions?.map((action, idx) => (
              <SunbeamAction key={idx} action={action} extension={props.extension} onReload={() => mutate()} />
            ))}
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
