import React from "react";
import { TextInput, TextInputProps, useColorScheme } from "react-native";

export function Input({ ...rest }: TextInputProps) {
  const colorScheme = useColorScheme();
  const placeholderColor = colorScheme === "dark" ? "#ccc" : "#666";

  return (
    <TextInput
      style={{
        height: 54,
        borderWidth: 1,
        borderRadius: 7,
        borderColor: "#999",
        paddingHorizontal: 16,
        marginBottom: 5,
        color: colorScheme === "dark" ? "#fff" : "#000",
      }}
      placeholderTextColor={placeholderColor} // Cor do placeholder
      {...rest}
    />
  );
}