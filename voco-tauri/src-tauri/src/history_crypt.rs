//! Windows DPAPI wrapper for at-rest encryption of session history.
//!
//! Uses CryptProtectData / CryptUnprotectData — the standard Windows API for
//! "encrypt this so only the current user on this machine can read it." No
//! key management on our side: Windows derives the key from the user's
//! credentials. If another user logs into the same machine, or someone copies
//! the file to another machine, decrypt fails.
//!
//! Why DPAPI vs rolling our own AES:
//!   - Zero key storage problem (we'd have to put the key somewhere either
//!     equally weak — registry, embedded constant — or force a user password)
//!   - Microsoft-blessed for exactly this use case (app data secrets)
//!   - Survives the typical "my laptop was stolen" threat model VoCo cares
//!     about (subscription product, user privacy)

#![cfg(windows)]

use anyhow::{anyhow, Result};
use windows::core::PCWSTR;
use windows::Win32::Foundation::{HLOCAL, LocalFree};
use windows::Win32::Security::Cryptography::{
    CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB,
};

pub fn encrypt(plain: &[u8]) -> Result<Vec<u8>> {
    unsafe {
        let in_blob = CRYPT_INTEGER_BLOB {
            cbData: plain.len() as u32,
            pbData: plain.as_ptr() as *mut u8,
        };
        let mut out_blob = CRYPT_INTEGER_BLOB::default();
        CryptProtectData(
            &in_blob,
            PCWSTR::null(),
            None,
            None,
            None,
            0,
            &mut out_blob,
        )
        .map_err(|e| anyhow!("CryptProtectData 失败: {e}"))?;
        let result =
            std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize).to_vec();
        let _ = LocalFree(HLOCAL(out_blob.pbData as *mut _));
        Ok(result)
    }
}

pub fn decrypt(cipher: &[u8]) -> Result<Vec<u8>> {
    unsafe {
        let in_blob = CRYPT_INTEGER_BLOB {
            cbData: cipher.len() as u32,
            pbData: cipher.as_ptr() as *mut u8,
        };
        let mut out_blob = CRYPT_INTEGER_BLOB::default();
        CryptUnprotectData(
            &in_blob,
            None,
            None,
            None,
            None,
            0,
            &mut out_blob,
        )
        .map_err(|e| anyhow!("CryptUnprotectData 失败: {e}"))?;
        let result =
            std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize).to_vec();
        let _ = LocalFree(HLOCAL(out_blob.pbData as *mut _));
        Ok(result)
    }
}
