import { Icon, List } from "@vicinae/api";
import { useSearch } from "./hooks";

interface GenericCommandProps<T> {
  searchFunction: (query: string) => Promise<T[]>;
  errorMessage: string;
  placeholder: string;
  emptyIcon: Icon;
  emptyTitle: string;
  emptyDescription: string;
  renderItems: (items: T[]) => JSX.Element[];
}

export default function GenericCommand<T>({
  searchFunction,
  errorMessage,
  placeholder,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  renderItems,
}: GenericCommandProps<T>) {
  const { items, isLoading, searchText, handleSearchTextChange } = useSearch(searchFunction, errorMessage);

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={handleSearchTextChange}
      searchBarPlaceholder={placeholder}
      isShowingDetail={true}
    >
      {renderItems(items)}

      {!isLoading && searchText && items.length === 0 && (
        <List.EmptyView
          icon={emptyIcon}
          title={`No results found for "${searchText}"`}
          description="Try a different search term"
        />
      )}

      {!isLoading && !searchText && (
        <List.EmptyView icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
      )}
    </List>
  );
}
