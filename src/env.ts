function getString(variableName: string, defaultValue?: string) {
  const value = process.env[variableName];
  if (value === undefined && defaultValue === undefined) {
    throw new Error(`ENV variable ${variableName} is not set and default value wasn't provided`);
  }
  return (value || defaultValue) as string;
}

function getNumber(variableName: string, defaultValue?: string) {
  return Number(getString(variableName, defaultValue));
}

function getUrlString(variableName: string, defaultValue?: string) {
  const url = getString(variableName, defaultValue);
  if (!isValidUrl(url)) {
    throw new Error(`ENV variable ${variableName} contains invalid url`);
  }
  return url;
}

function isValidUrl(envValue: string) {
  try {
    new URL(envValue);
    return true;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_) {
    return false;
  }
}

export default {
  string: getString,
  number: getNumber,
  url: getUrlString,
};
