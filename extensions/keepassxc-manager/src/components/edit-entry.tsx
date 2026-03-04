import {
   Action,
   ActionPanel,
   Form,
   Icon,
   showToast,
   Toast,
} from "@vicinae/api";
import { useState } from "react";
import { KeePassLoader } from "../utils/keepass-loader";

interface EditEntryProps {
   entry: string[];
   onEditComplete: () => void;
}

/**
 * Component to edit a KeePassXC database entry.
 */
export default function EditEntry({ entry, onEditComplete }: EditEntryProps) {
   const [
      group,
      originalTitle,
      originalUsername,
      originalPassword,
      originalUrl,
      originalNotes,
   ] = entry;

   const [title, setTitle] = useState(originalTitle);
   const [username, setUsername] = useState(originalUsername || "");
   const [password, setPassword] = useState(originalPassword || "");
   const [url, setUrl] = useState(originalUrl || "");
   const [notes, setNotes] = useState(originalNotes || "");
   const [isLoading, setIsLoading] = useState(false);

   const [titleError, setTitleError] = useState<string | undefined>();
   const [urlError, setUrlError] = useState<string | undefined>();

   const validateUrl = (urlString: string): boolean => {
      if (!urlString || urlString.trim() === "") return true; // URL is optional

      try {
         new URL(urlString);
         return true;
      } catch {
         return false;
      }
   };

   const handleSubmit = async (values: Form.Values) => {
      // Validate title
      if (!values.title || (values.title as string).trim() === "") {
         setTitleError("Title is required");
         return;
      }
      setTitleError(undefined);

      // Validate URL if provided
      if (values.url && !validateUrl(values.url as string)) {
         setUrlError("Invalid URL format");
         return;
      }
      setUrlError(undefined);

      setIsLoading(true);

      const entryPath = KeePassLoader.getEntryPath(entry);

      const newData: {
         title?: string;
         username?: string;
         password?: string;
         url?: string;
         notes?: string;
      } = {};

      // Only include changed fields
      if (values.title !== originalTitle) {
         newData.title = values.title as string;
      }
      if (values.username !== originalUsername) {
         newData.username = values.username as string;
      }
      // Include password if it changed (even if empty)
      if (values.password !== originalPassword) {
         newData.password = values.password as string;
      }
      if (values.url !== originalUrl) {
         newData.url = values.url as string;
      }
      if (values.notes !== originalNotes) {
         newData.notes = values.notes as string;
      }

      // Check if anything changed
      if (Object.keys(newData).length === 0) {
         showToast(
            Toast.Style.Animated,
            "No Changes",
            "No fields were modified",
         );
         setIsLoading(false);
         return;
      }

      // Show saving toast
      const savingToast = await showToast({
         style: Toast.Style.Animated,
         title: "Saving Changes...",
      });

      try {
         await KeePassLoader.editEntry(entryPath, newData);

         savingToast.style = Toast.Style.Animated;
         savingToast.title = "Refreshing Cache...";

         await KeePassLoader.refreshEntriesCache();

         savingToast.style = Toast.Style.Success;
         savingToast.title = "Success";
         savingToast.message = "Entry updated successfully";

         onEditComplete();
      } catch (error) {
         console.error("Edit error:", error);
         savingToast.style = Toast.Style.Failure;
         savingToast.title = "Error";
         savingToast.message =
            (error as Error).message || "Failed to update entry";
      } finally {
         setIsLoading(false);
      }
   };

   return (
      <Form
         isLoading={isLoading}
         actions={
            <ActionPanel>
               <Action.SubmitForm
                  title="Save Changes"
                  icon={Icon.Check}
                  onSubmit={handleSubmit}
               />
            </ActionPanel>
         }
      >
         <Form.Description
            title="Editing Entry"
            text={`Group: ${group || "None"}`}
         />

         <Form.TextField
            id="title"
            title="Title"
            value={title}
            onChange={(value) => {
               setTitle(value);
               if (titleError) setTitleError(undefined);
            }}
            error={titleError}
         />

         <Form.TextField
            id="username"
            title="Username"
            value={username}
            onChange={setUsername}
         />

         <Form.PasswordField
            id="password"
            title="Password"
            value={password}
            onChange={setPassword}
         />

         <Form.TextField
            id="url"
            title="URL"
            value={url}
            onChange={(value) => {
               setUrl(value);
               if (urlError) setUrlError(undefined);
            }}
            error={urlError}
         />

         <Form.TextArea
            id="notes"
            title="Notes"
            value={notes}
            onChange={setNotes}
         />
      </Form>
   );
}
