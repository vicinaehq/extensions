import { List } from "@vicinae/api";
import { useState } from "react";
import { execPromise } from "../utils/exec";
import { useEffect } from "react";

export const IfCliCommandSucceeds = ({
	onSuccess,
	onFail,
	command,
}: {
	onSuccess: React.ReactNode;
	onFail: React.ReactNode;
	command: string;
}) => {
	const [isLoading, setIsLoading] = useState(true);
	const [succeeded, setSucceeded] = useState(false);

	useEffect(() => {
		execPromise(command)
			.then(({ stdout, stderr }) => {
				setSucceeded(stdout.trim() !== "" && stderr.trim() === "");
			})
			.catch(() => {
				setSucceeded(false);
			})
			.finally(() => {
				setIsLoading(false);
			});
	}, []);

	if (isLoading) {
		return <List isLoading={true} />;
	}

	if (succeeded) {
		return onSuccess;
	}

	return onFail;
};
