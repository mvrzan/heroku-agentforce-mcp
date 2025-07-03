export const getCurrentTimestamp = () => {
  const now = new Date();
  const day = now.getDate().toString().padStart(2, "0");
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const year = now.getFullYear();
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const seconds = now.getSeconds().toString().padStart(2, "0");
  const milliseconds = Math.round(now.getMilliseconds() / 10)
    .toString()
    .padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}:${milliseconds}`;
};
