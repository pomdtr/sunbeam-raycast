import { useEffect, useState } from "react";
import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { Action, ActionPanel, List } from "@raycast/api";
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
        Object.entries(manifest.commands).map(([key, command]) => (
          <List.Item
            key={key}
            title={command.title}
            subtitle={command.description}
            accessories={[{ text: key }]}
            actions={
              <ActionPanel>
                <Action.Push
                  title="Run Command"
                  target={<SunbeamPage action={{ type: "push", command: [join(command.dir, command.entryPoint)] }} />}
                />
              </ActionPanel>
            }
          />
        ))}
    </List>
  );
}
