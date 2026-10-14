import BrowseList from './components/BrowseList.js';

// The `Show Albums` command is the combined Albums-or-Songs surface. The
// dropdown next to the search bar flips between the two result types while
// keeping the typed query.
export default function Albums() {
  return <BrowseList />;
}
