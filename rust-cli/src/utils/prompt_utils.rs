// Prompt utility functions
use std::io::{self, Write};

pub fn prompt_user(prompt: &str) -> Result<String, io::Error> {
    print!("{}", prompt);
    io::stdout().flush()?;
    
    let mut input = String::new();
    io::stdin().read_line(&mut input)?;
    
    Ok(input.trim().to_string())
}

pub fn prompt_yes_no(prompt: &str) -> Result<bool, io::Error> {
    loop {
        let response = prompt_user(&format!("{} (y/n): ", prompt))?;
        match response.to_lowercase().as_str() {
            "y" | "yes" => return Ok(true),
            "n" | "no" => return Ok(false),
            _ => println!("Please enter 'y' or 'n'"),
        }
    }
}

pub fn prompt_choice<T: Clone>(prompt: &str, choices: &[T]) -> Result<T, io::Error> 
where 
    T: std::fmt::Display 
{
    println!("{}", prompt);
    for (i, choice) in choices.iter().enumerate() {
        println!("{}. {}", i + 1, choice);
    }
    
    loop {
        let input = prompt_user("Enter your choice: ")?;
        if let Ok(index) = input.parse::<usize>() {
            if index > 0 && index <= choices.len() {
                return Ok(choices[index - 1].clone());
            }
        }
        println!("Please enter a valid choice (1-{})", choices.len());
    }
}