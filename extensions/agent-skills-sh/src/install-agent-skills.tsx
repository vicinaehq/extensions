import {
	Action,
	ActionPanel,
	Icon,
	Image,
	ImageLike,
	List,
} from "@vicinae/api";
import { useState } from "react";
import { useSkills } from "./hooks";
import type { Skill } from "./skills";

const buildSkillInstallCommand = (skill: Skill): string[] => {
	const githubUrl = `https://github.com/${skill.source}`;

	return ["npx", "skills", "add", githubUrl, "--skill", skill.name];
};

const formatDownloadCount = (n: number) => {
	if (n < 1000) return `${n}`;
	return `${(n / 1000).toFixed(1)}K`;
};

const githubAvatar = (user: string) => {
	return `https://avatars.githubusercontent.com/${user}`;
};

const SkillItem = ({ skill }: { skill: Skill }) => {
	const getIcon = (): ImageLike => {
		const [author, _] = skill.source.split("/");
		return {
			source: githubAvatar(author),
			mask: Image.Mask.Circle,
		};
	};

	const githubUrl = `https://github.com/${skill.source}`;
	const skillCommand = buildSkillInstallCommand(skill);
	const skillCommandStr = skillCommand.join(" ");

	return (
		<List.Item
			key={skill.id}
			title={skill.name}
			subtitle={skill.source}
			icon={getIcon()}
			accessories={[
				{ icon: Icon.Download, text: `${formatDownloadCount(skill.installs)}` },
			]}
			actions={
				<ActionPanel>
					<Action.Paste
						title={"Paste install command"}
						content={skillCommandStr}
					/>
					<Action.CopyToClipboard
						title={"Copy install command"}
						content={skillCommandStr}
					/>
					<Action.OpenInBrowser
						title={"Open skills.sh page"}
						icon={Icon.Globe01}
						url={`https://skills.sh/${skill.id}`}
					/>
					<Action.OpenInBrowser
						title={"Open repository"}
						icon={Icon.Globe01}
						url={githubUrl}
					/>
					<Action.RunInTerminal
						title="Run install command"
						icon={Icon.Terminal}
						args={skillCommand}
					/>
				</ActionPanel>
			}
		/>
	);
};

export default function InstallAgentSkills() {
	const [query, setQuery] = useState("");
	const { skills, isLoading, error } = useSkills(query);

	return (
		<List
			isLoading={isLoading}
			throttle
			searchBarPlaceholder="Search for agent skills..."
			onSearchTextChange={setQuery}
		>
			{error ? (
				<List.EmptyView
					title="Failed to search skills"
					description={error.message}
				/>
			) : query.length <= 2 ? (
				<List.EmptyView
					title="Type at least 3 characters to search"
					icon={Icon.Keyboard}
				/>
			) : !isLoading && skills.length === 0 ? (
				<List.EmptyView
					title="No matching skills"
					description="No skill matches your search. Try something else!"
				/>
			) : null}

			<List.Section title={`Skills (${skills.length})`}>
				{skills.map((sk) => (
					<SkillItem key={sk.id} skill={sk} />
				))}
			</List.Section>
		</List>
	);
}
