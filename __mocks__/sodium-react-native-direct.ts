const unavailable = new Proxy(
  {},
  {
    get() {
      throw new Error("The package 'sodium-react-native-direct' is unavailable in Jest.");
    },
  },
);

export default unavailable;
