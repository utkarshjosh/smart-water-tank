import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth } from '../config/firebase';
import api from '../config/api';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (isSignUp && !name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        // Create Firebase user
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Update Firebase user profile with displayName
        if (name.trim()) {
          await updateProfile(user, {
            displayName: name.trim(),
          });
        }

        // Register user in backend database
        try {
          await api.post('/api/v1/user/register', {
            name: name.trim(),
          });
        } catch (apiError: any) {
          // If user already exists in backend, that's okay
          if (apiError.response?.status !== 409) {
            console.error('Failed to register user in backend:', apiError);
            // Don't fail the registration, but log the error
          }
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Water Tank Monitor</Text>
      <Text style={styles.subtitle}>
        {isSignUp ? 'Create an account' : 'Sign in to continue'}
      </Text>

      {isSignUp && (
        <TextInput
          style={styles.input}
          placeholder="Full Name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />
      )}

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleAuth}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.switchButton}
        onPress={() => {
          setIsSignUp(!isSignUp);
          // Clear name when switching modes
          if (!isSignUp) {
            setName('');
          }
        }}
      >
        <Text style={styles.switchText}>
          {isSignUp
            ? 'Already have an account? Sign in'
            : "Don't have an account? Sign up"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 30,
  },
  input: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  switchButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  switchText: {
    color: '#007AFF',
    fontSize: 14,
  },
});


