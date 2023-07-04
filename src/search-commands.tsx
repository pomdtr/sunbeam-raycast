import { useEffect, useState } from "react";
import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { SunbeamPage } from "./sunbeam";

type Manifest = {
  commands: {
    [key: string]: {
      schemaVersion: number;
      title: string;
      description?: string;
      mode: string;
      origin: string;
      version: string;
      dir: string;
      entryPoint: string;
    };
  };
};

function deeplink(command: string): string {
  const args = encodeURIComponent(JSON.stringify({ command }));
  return `raycast://extensions/pomdtr/sunbeam/run-command?arguments=${args}`;
}

export default function SearchCommands() {
  const [manifest, setManifest] = useState<Manifest>();
  useEffect(() => {
    readFile(join(homedir(), "Library/Application Support/Sunbeam/commands.json"), "utf-8")
      .then((text) => JSON.parse(text))
      .then(setManifest);
  }, []);

  return (
    <List navigationTitle="Search Commands" isLoading={!manifest} searchBarPlaceholder="Search Commands...">
      {manifest?.commands &&
        Object.entries(manifest.commands).map(([name, command]) => (
          <List.Item
            key={name}
            title={command.title}
            subtitle={command.description}
            accessories={[{ text: name }]}
            actions={
              <ActionPanel>
                <Action.Push
                  icon={Icon.Terminal}
                  title="Run Command"
                  target={<SunbeamPage action={{ type: "push", command: ["sunbeam", name] }} />}
                />
                <Action.CreateQuicklink
                  title="Create Quicklink"
                  quicklink={{
                    name: command.title,
                    link: deeplink(name),
                  }}
                />
              </ActionPanel>
            }
          />
        ))}
    </List>
  );
}
