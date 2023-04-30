import { LocalStorage } from "@raycast/api";
import { useEffect } from "react";
import { useState } from "react";

export type CommandHistory = {
  [command: string]: {
    lastUsed: number;
  };
};

export function useCommandHistory() {
  const [commands, setCommands] = useState<CommandHistory>();

  useEffect(() => {
    LocalStorage.getItem<string>("commandHistory")
      .then((value) => JSON.parse(value ? value : "{}"))
      .then(setCommands);
  }, []);

  return {
    isLoading: commands === undefined,
    commands,
    saveCommand: async (command: string) => {
      const newCommandHistory = {
        ...commands,
        [command]: {
          lastUsed: Date.now(),
        },
      };
      setCommands(newCommandHistory);
      await LocalStorage.setItem("commandHistory", JSON.stringify(newCommandHistory));
    },
    removeCommand: async (command: string) => {
      const newCommandHistory = { ...commands };
      delete newCommandHistory[command];
      setCommands(newCommandHistory);
      await LocalStorage.setItem("commandHistory", JSON.stringify(newCommandHistory));
    },
  };
}
