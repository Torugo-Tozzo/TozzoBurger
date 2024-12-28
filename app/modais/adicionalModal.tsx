import React, { useEffect, useState } from 'react';
import { StyleSheet, TextInput, Alert, useColorScheme, Pressable, Text as RNText } from 'react-native';
import { Picker } from "@react-native-picker/picker";
import { Text, View } from '@/components/Themed';
import { useProductDatabase } from '@/database/useProductDatabase';
import { useRouter } from 'expo-router';
import { useCart } from '@/context/CartContext';

export default function AdicionalModalScreen() {
    const { create, getTipoProdutos } = useProductDatabase();

    const [nome, setNome] = useState('');
    const [preco, setPreco] = useState('');
    const router = useRouter();
    const { addToCart, cart } = useCart();

    const colorScheme = useColorScheme();
    const placeholderColor = 'grey';



    async function handleSave() {
        try {
            if (!nome || !preco) {
                Alert.alert('Erro', 'Por favor, preencha todos os campos.');
                return;
            }

            let response = await create({
                nome,
                preco: parseFloat(preco),
                tipoProdutoId: 8,
            });
            
            let produtoCriadoId = Number(response.insertedRowId);

            await addToCart({
                id: produtoCriadoId,
                nome,
                preco: parseFloat(preco),
                tipoProdutoId: 8,
                quantidade: 1,
            });

            router.back();

        } catch (error) {
            console.error('Erro ao salvar produto:', error);
            Alert.alert('Erro', 'Houve um erro ao salvar o produto.');
        }
    }

    const styles = StyleSheet.create({
        container: {
            flex: 1,
            padding: 20,
        },
        title: {
            fontSize: 30,
            fontWeight: 'bold',
        },
        separator: {
            marginVertical: 20,
            height: 1,
            width: '80%',
        },
        input: {
            width: '100%',
            padding: 10,
            marginVertical: 10,
            borderWidth: 1,
            borderColor: '#ccc',
            borderRadius: 5,
            color: colorScheme === "dark" ? "#fff" : "#000",
        },
        picker: {
            color: 'grey',
        },
        buttonContainer: {
            width: '100%',
            marginTop: 20,
            backgroundColor: '#007BFF',
            paddingVertical: 12,
            borderRadius: 5,
            alignItems: 'center',
        },
        buttonText: {
            color: '#fff',
            fontSize: 16,
            fontWeight: 'bold',
        },
    });

    return (
        <View style={styles.container}>
            <Text style={styles.title} lightColor="black" darkColor="white">
                Produto Adicional
            </Text>
            <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
            <Text style={{ fontSize: 16, margin: 10, fontWeight: "bold" }}>Nome do Produto</Text>
            <TextInput
                style={styles.input}
                placeholder="Digite o Nome..."
                value={nome}
                onChangeText={setNome}
                placeholderTextColor={placeholderColor}
            />
            <Text style={{ fontSize: 16, margin: 10, fontWeight: "bold" }}>Preço do Produto</Text>
            <TextInput
                style={styles.input}
                placeholder="Digite o Preço..."
                value={preco}
                keyboardType="numeric"
                onChangeText={setPreco}
                placeholderTextColor={placeholderColor}
            />
            <Pressable style={styles.buttonContainer} onPress={handleSave}>
                <RNText style={styles.buttonText}>Salvar</RNText>
            </Pressable>
        </View>
    );
}
