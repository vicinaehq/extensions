import {
   Action,
   ActionPanel,
   Form,
   Icon,
   getPreferenceValues,
} from "@vicinae/api";
import { useState } from "react";
import path from "path";
import { KeePassLoader, showToastCliErrors } from "../utils/keepass-loader";

interface UnlockDatabaseProps {
   onUnlock: (password: string, keyFile: string) => void;
}

interface Preference {
   database: string;
}

const resolvePath = (p: string): string => {
   if (p.startsWith("~")) {
      return p.replace("~", process.env.HOME || "/home/user");
   }
   return path.resolve(p);
};

export default function UnlockDatabase({ onUnlock }: UnlockDatabaseProps) {
   const preferences: Preference = getPreferenceValues();
   const [isLoading, setIsLoading] = useState(false);

   const handleSubmit = (values: Form.Values) => {
      setIsLoading(true);

      const password = values.password as string;

      // Los FilePicker pueden retornar string o string[] o number
      let databaseValue = values.databaseOverride;
      let keyFileValue = values.keyFile;

      console.log("=== RAW VALUES ===");
      console.log("databaseOverride type:", typeof databaseValue);
      console.log("databaseOverride value:", databaseValue);
      console.log("keyFile type:", typeof keyFileValue);
      console.log("keyFile value:", keyFileValue);

      // Normalizar a string con validación de tipo
      let databasePath = "";
      if (Array.isArray(databaseValue) && databaseValue.length > 0) {
         databasePath = String(databaseValue[0]);
      } else if (typeof databaseValue === "string") {
         databasePath = databaseValue;
      }

      let keyFilePath = "";
      if (Array.isArray(keyFileValue) && keyFileValue.length > 0) {
         keyFilePath = String(keyFileValue[0]);
      } else if (typeof keyFileValue === "string") {
         keyFilePath = keyFileValue;
      }

      // Aplicar lógica final
      const finalDatabase =
         databasePath && databasePath !== "/"
            ? resolvePath(databasePath)
            : resolvePath(preferences.database);

      const finalKeyFile =
         keyFilePath && keyFilePath !== "/" ? resolvePath(keyFilePath) : "";

      console.log("=== FINAL VALUES ===");
      console.log("Final database:", finalDatabase);
      console.log("Final key file:", finalKeyFile);
      console.log("Password received:", password ? "Yes" : "No");

      KeePassLoader.checkCredentials(password, finalKeyFile, finalDatabase)
         .then(() => {
            KeePassLoader.cacheCredentials(password, finalKeyFile);
            onUnlock(password, finalKeyFile);
         })
         .catch((error) => {
            console.error("Unlock error:", error);
            showToastCliErrors(error as { message: string });
         })
         .finally(() => {
            setIsLoading(false);
         });
   };

   return (
      <Form
         isLoading={isLoading}
         actions={
            <ActionPanel>
               <Action.SubmitForm
                  title="Unlock Database"
                  icon={Icon.Lock}
                  onSubmit={handleSubmit}
               />
            </ActionPanel>
         }
      >
         <Form.Description
            title="Default Database"
            text={preferences.database}
         />
         <Form.FilePicker
            id="databaseOverride"
            title="Override Database (Optional)"
            canChooseFiles={true}
            allowMultipleSelection={false}
         />
         <Form.PasswordField id="password" title="Password" />
         <Form.FilePicker
            id="keyFile"
            title="Key File (Optional)"
            canChooseFiles={true}
            allowMultipleSelection={false}
         />
      </Form>
   );
}
