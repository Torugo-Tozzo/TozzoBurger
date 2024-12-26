import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, TextInput, FlatList, Alert, Pressable, Text as RNText } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColorScheme } from '@/components/useColorScheme';

type Adicional = {
    id: number;
    nome: string;
};

export default function AdicionalModalScreen() {
    const { productId } = useLocalSearchParams();
    const router = useRouter();

    const [nome, setNome] = useState('');
    const [preco, setPreco] = useState('');
    const [adicionais, setAdicionais] = useState<Adicional[]>([]);
    const [adicionaisSelecionados, setAdicionaisSelecionados] = useState<Adicional[]>([]);
    const colorScheme = useColorScheme();

    useEffect(() => {
        if (productId) {
            // Mock de adicionais disponíveis
            setAdicionais([
                { id: 1, nome: 'Adicional 1' },
                { id: 2, nome: 'Adicional 2' },
                { id: 3, nome: 'Adicional 3' },
            ]);
        }
    }, [productId]);

    function handleToggleAdicional(adicional: Adicional) {
        setAdicionaisSelecionados((prev) =>
            prev.some((item) => item.id === adicional.id)
                ? prev.filter((item) => item.id !== adicional.id)
                : [...prev, adicional]
        );
    }

    function handleSave() {
        if (!productId) {
            Alert.alert('Produto Criado', `Nome: ${nome}\nPreço: ${preco}`);
        } else {
            Alert.alert('Adicionais Salvos', `Adicionais: ${adicionaisSelecionados.map((a) => a.nome).join(', ')}`);
        }
        router.back();
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
        },
        adicionalContainer: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 10,
            borderBottomWidth: 1,
            borderColor: '#ccc',
        },
        adicionalText: {
            fontSize: 16,
        },
        adicionalButton: {
            backgroundColor: '#007BFF',
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderRadius: 5,
        },
        adicionalButtonText: {
            color: '#fff',
            fontSize: 14,
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
            <Text style={styles.title}>{productId ? 'Selecionar Adicionais' : 'Cadastro Rápido'}</Text>
            <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />

            {!productId ? (
                <>
                    <Text style={{ fontSize: 16, margin: 10, fontWeight: "bold" }}>Nome do Produto</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Digite o Nome.."
                        value={nome}
                        onChangeText={setNome}
                        placeholderTextColor='grey'
                    />
                    <Text style={{ fontSize: 16, margin: 10, fontWeight: "bold" }}>Preço do Produto</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Digite o Preço.."
                        value={preco}
                        keyboardType="numeric"
                        onChangeText={setPreco}
                        placeholderTextColor='grey'
                    />
                </>
            ) : (
                <FlatList
                    data={adicionais}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={({ item }) => (
                        <View style={styles.adicionalContainer}>
                            <Text style={styles.adicionalText}>{item.nome}</Text>
                            <Pressable
                                style={[
                                    styles.adicionalButton,
                                    adicionaisSelecionados.some((a) => a.id === item.id) && { backgroundColor: '#28a745' },
                                ]}
                                onPress={() => handleToggleAdicional(item)}
                            >
                                <RNText style={styles.adicionalButtonText}>
                                    {adicionaisSelecionados.some((a) => a.id === item.id) ? 'Remover' : 'Adicionar'}
                                </RNText>
                            </Pressable>
                        </View>
                    )}
                />
            )}

            <Pressable style={styles.buttonContainer} onPress={handleSave}>
                <RNText style={styles.buttonText}>Adicionar na Conta</RNText>
            </Pressable>
        </View>
    );
}
