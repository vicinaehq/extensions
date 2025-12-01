export type PasswordEntry = {
  value: string;
  /**
   * When true, OTP codes are inserted before other fields
   * because the last action used the password itself.
   */
  showOtpFirst?: boolean;
};

export type PasswordOptionType = "password" | "otp" | "field" | "note";

export type PasswordOption = {
  title: string;
  value: string;
  type?: PasswordOptionType;
};

export type LastUsedRecord = {
  password: string;
  option: string;
  timestamp: number;
};

export type PasswordOptionsResult = {
  options: PasswordOption[];
  warnings: string[];
};
